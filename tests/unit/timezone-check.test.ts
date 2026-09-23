import { describe, expect, it } from "vitest";
import { timezoneCheck, summarize } from "@/lib/config/setup-checks";

/**
 * A hosted server runs on UTC unless told otherwise, and every date in this
 * app is worked out on the server: which habit card says "Today", which day a
 * tick is logged against, how many days until an exam. A student one or two
 * hours ahead of UTC is on the next day before the server is — so from
 * midnight until their morning, the app is confidently on yesterday.
 */
describe("timezoneCheck", () => {
  it.each(["UTC", "Etc/UTC", "Etc/GMT", undefined, ""])("warns when the server is on %s", (zone) => {
    const check = timezoneCheck(zone);
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/UTC/);
    // The consequence, in the words of the thing it breaks — not "clock skew".
    expect(check.detail).toMatch(/Today/);
    expect(check.fix).toMatch(/TZ=Europe\/Zurich/);
  });

  it("is satisfied once the server has a real zone", () => {
    const check = timezoneCheck("Europe/Zurich");
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("Europe/Zurich");
  });

  it("reports the offset the dates are actually built with", () => {
    // This process runs on UTC, so a named zone still reports +00:00 here —
    // what matters is that the offset is read, not assumed from the name.
    expect(timezoneCheck("Europe/Zurich").detail).toMatch(/UTC[+-]\d{2}:\d{2}/);
  });

  // A UTC server is a real problem but not a data-destroying one, so it must
  // not shout over the checks that are.
  it("does not turn the whole card into a data-loss warning", () => {
    const summary = summarize([timezoneCheck("UTC")]);
    expect(summary.status).toBe("warn");
    expect(summary.label).not.toMatch(/lose data/);
  });

  it("stays out of the way when everything else is fine and the zone is set", () => {
    expect(summarize([timezoneCheck("Europe/Zurich")]).status).toBe("ok");
  });
});
