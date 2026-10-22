import { describe, expect, it } from "vitest";
import {
  buildAuthUrl,
  classifyRedirectError,
  exchangeCode,
  GoogleError,
  refreshAccessToken,
} from "@/lib/google/oauth";
import { classifyApiError, parseDue } from "@/lib/google/classroom";
import { GOOGLE_SCOPES } from "@/lib/google/config";

const CREDS = { clientId: "id.apps.googleusercontent.com", clientSecret: "secret", redirectUri: "https://app.example/api/google/callback" };

/** A stand-in for Google that answers with exactly the given body. */
function fakeFetch(status: number, body: unknown) {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as Response) as typeof fetch;
}

describe("buildAuthUrl", () => {
  const url = new URL(buildAuthUrl({ ...CREDS, state: "abc123" }));

  it("asks for a refresh token, or the connection dies after an hour", () => {
    // Both of these are needed: without them Google hands back an access
    // token only, and the connection silently stops working the same day.
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("asks only for read-only scopes on this student's own work", () => {
    const asked = url.searchParams.get("scope")?.split(" ") ?? [];
    expect(asked).toEqual([...GOOGLE_SCOPES]);
    for (const scope of asked) {
      expect(scope, scope).toMatch(/\.readonly$|\.me\.readonly$/);
    }
    // Nothing that could write to the school's Classroom, and nothing that
    // reads another student's work.
    expect(asked.join(" ")).not.toMatch(/students$|rosters|profile\.emails|coursework\.students/);
  });

  it("carries the state through, which is what makes the callback safe", () => {
    expect(url.searchParams.get("state")).toBe("abc123");
  });
});

describe("classifyRedirectError", () => {
  it("names an administrator block for what it is", () => {
    const error = classifyRedirectError("admin_policy_enforced");
    expect(error?.kind).toBe("ADMIN_BLOCKED");
    // The one thing a student must not be left thinking is that retrying
    // will help, or that the app is broken.
    expect(error?.message).toMatch(/school/i);
    expect(error?.message).toMatch(/administrator/i);
  });

  it("says both possibilities for access_denied, because Google means both", () => {
    const error = classifyRedirectError("access_denied");
    expect(error?.message).toMatch(/cancelled/i);
    expect(error?.message).toMatch(/administrator/i);
  });

  it("is quiet when nothing went wrong", () => {
    expect(classifyRedirectError(null)).toBeNull();
  });
});

describe("exchangeCode", () => {
  it("turns Google's seconds into a real expiry", async () => {
    const now = new Date("2026-05-10T12:00:00Z");
    const tokens = await exchangeCode("code", {
      ...CREDS,
      now,
      fetch: fakeFetch(200, { access_token: "at", refresh_token: "rt", expires_in: 3599, scope: GOOGLE_SCOPES.join(" ") }),
    });
    expect(tokens.accessToken).toBe("at");
    expect(tokens.refreshToken).toBe("rt");
    expect(tokens.expiresAt.toISOString()).toBe("2026-05-10T12:59:59.000Z");
  });

  it("reports an expired or withdrawn permission as needing a reconnect", async () => {
    // invalid_grant is what Google returns roughly weekly while the app is
    // in testing mode. It must not read as a crash.
    await expect(
      exchangeCode("code", { ...CREDS, fetch: fakeFetch(400, { error: "invalid_grant" }) })
    ).rejects.toMatchObject({ kind: "NEEDS_RECONNECT" });
  });

  it("recognises a policy refusal in the description", async () => {
    await expect(
      exchangeCode("code", {
        ...CREDS,
        fetch: fakeFetch(403, { error: "access_denied", error_description: "Blocked by admin policy" }),
      })
    ).rejects.toMatchObject({ kind: "ADMIN_BLOCKED" });
  });

  it("does not pretend a reply with no token is a success", async () => {
    await expect(exchangeCode("code", { ...CREDS, fetch: fakeFetch(200, {}) })).rejects.toBeInstanceOf(GoogleError);
  });
});

describe("refreshAccessToken", () => {
  it("keeps the refresh token it already had", async () => {
    // Google returns a refresh token once, at the very first consent. Taking
    // the reply at face value here throws it away and the connection becomes
    // one hour long.
    const tokens = await refreshAccessToken("original-rt", {
      ...CREDS,
      fetch: fakeFetch(200, { access_token: "new-at", expires_in: 3600 }),
    });
    expect(tokens.refreshToken).toBe("original-rt");
  });

  it("takes a new refresh token when Google sends one", async () => {
    const tokens = await refreshAccessToken("original-rt", {
      ...CREDS,
      fetch: fakeFetch(200, { access_token: "new-at", refresh_token: "rotated", expires_in: 3600 }),
    });
    expect(tokens.refreshToken).toBe("rotated");
  });
});

describe("classifyApiError", () => {
  const cases: [string, number, unknown, string][] = [
    [
      "the Classroom API is switched off in the Cloud project",
      403,
      { error: { message: "Google Classroom API has not been used in project 123 before or it is disabled" } },
      "API_NOT_ENABLED",
    ],
    [
      "the granted permission is too narrow",
      403,
      { error: { message: "Request had insufficient authentication scopes.", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } },
      "MISSING_SCOPE",
    ],
    ["the account has no Classroom", 403, { error: { message: "@ClassroomDisabled" } }, "NOT_A_CLASSROOM_USER"],
    ["a bare 403 against a school account", 403, { error: { message: "Permission denied" } }, "ADMIN_BLOCKED"],
    ["the token has gone stale", 401, { error: { message: "Invalid Credentials" } }, "NEEDS_RECONNECT"],
    ["too many requests", 429, {}, "RATE_LIMITED"],
  ];

  for (const [name, status, body, kind] of cases) {
    it(`recognises ${name}`, () => {
      expect(classifyApiError(status, body as never).kind).toBe(kind);
    });
  }

  it("says what it got when it recognises nothing, instead of guessing", () => {
    const error = classifyApiError(500, { error: { message: "backend hiccup" } });
    expect(error.kind).toBe("UNKNOWN");
    expect(error.message).toContain("500");
  });
});

describe("parseDue", () => {
  it("joins Classroom's separate date and time", () => {
    expect(parseDue({ year: 2026, month: 5, day: 15 }, { hours: 16, minutes: 30 })?.toISOString()).toBe(
      "2026-05-15T16:30:00.000Z"
    );
  });

  it("treats a date with no time as the end of that day", () => {
    // Midnight would make everything due the night before and mark it late a
    // full day early.
    expect(parseDue({ year: 2026, month: 5, day: 15 }, undefined)?.toISOString()).toBe("2026-05-15T23:59:00.000Z");
  });

  it("has no date rather than a made-up one", () => {
    expect(parseDue(undefined, { hours: 9 })).toBeNull();
    expect(parseDue({ year: 2026 }, undefined)).toBeNull();
    expect(parseDue({}, {})).toBeNull();
  });
});
