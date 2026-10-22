"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { disconnectClassroom, syncClassroom, type SyncResult } from "@/lib/google/actions";
import { GOOGLE_FAILURE_MESSAGE, type GoogleFailure } from "@/lib/google/oauth";
import type { GoogleConnection } from "@/lib/google/connection";

/**
 * Connecting Google Classroom, and saying plainly when it cannot be.
 *
 * The card is written around the likeliest outcome rather than the happy one:
 * this is pointed at a school's Google account, and a Workspace administrator
 * who does not allow outside apps is the normal case, not an edge case. That
 * refusal has to arrive as a sentence explaining that it is set at the school
 * and cannot be worked around here — not as a button that keeps failing.
 */

/** The short code the OAuth callback sends back, as something readable. */
function messageFor(code: string | null): { tone: "good" | "bad"; text: string } | null {
  if (!code) return null;
  if (code === "connected") return { tone: "good", text: "Connected. Press “Sync now” to bring your coursework in." };
  if (code === "unconfigured") {
    return {
      tone: "bad",
      text: "This app has no Google credentials yet, so there is nothing to connect to. They go in as GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET where the app's other environment variables are set.",
    };
  }
  if (code === "BAD_STATE") {
    return {
      tone: "bad",
      text: "That sign-in didn't come back the way it went out, so it was refused. Start it again from this page.",
    };
  }
  const known = GOOGLE_FAILURE_MESSAGE[code as GoogleFailure];
  return { tone: "bad", text: known ?? GOOGLE_FAILURE_MESSAGE.UNKNOWN };
}

function summarise(result: SyncResult): string {
  if (!result.ok) return result.error ?? GOOGLE_FAILURE_MESSAGE.UNKNOWN;
  const parts = [
    `${result.courses} ${result.courses === 1 ? "course" : "courses"} read`,
    `${result.created} added`,
    `${result.updated} updated`,
  ];
  // Counted rather than quietly dropped: a student who knows three pieces of
  // work have no deadline can go and look at them.
  if (result.skippedNoDueDate > 0) parts.push(`${result.skippedNoDueDate} with no due date left out`);
  if (result.skippedTooOld > 0) parts.push(`${result.skippedTooOld} older than a month left out`);
  return `${parts.join(" · ")}.`;
}

export function GoogleClassroomCard({
  connection,
  configured,
  configProblem,
  callbackCode,
}: {
  connection: GoogleConnection;
  configured: boolean;
  configProblem: string | null;
  callbackCode: string | null;
}) {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [disconnected, setDisconnected] = useState(false);

  const callbackMessage = messageFor(callbackCode);
  const connected = connection.connected && !disconnected;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Reads your own Google Classroom — your courses, the work set in them and your own submissions — and puts the
        work into School with its due date. It is read-only: nothing in this app can change anything in Classroom.
      </p>

      {!configured && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs" data-testid="google-unconfigured">
          Not set up yet. {configProblem}
          {/*
            Both states at once is a real combination — credentials removed
            after connecting — and showing "not set up" above "connected as…"
            with nothing joining them reads as a contradiction.
          */}
          {connected && " Until that is set again, the connection below cannot be used."}
        </p>
      )}

      {callbackMessage && (
        <p
          className={`rounded-lg border p-3 text-xs ${
            callbackMessage.tone === "good" ? "border-success/40 bg-success/10" : "border-danger/40 bg-danger/10"
          }`}
          data-testid="google-callback-message"
        >
          {callbackMessage.text}
        </p>
      )}

      {connected ? (
        <>
          <p className="text-sm" data-testid="google-connected">
            Connected{connection.email ? ` as ${connection.email}` : ""}.
            {connection.lastSyncAt && (
              <span className="text-muted"> Last synced {connection.lastSyncAt.toLocaleString()}.</span>
            )}
          </p>

          {connection.needsReconnect && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
              {GOOGLE_FAILURE_MESSAGE.NEEDS_RECONNECT}
            </p>
          )}

          {connection.lastSyncError && !result && (
            <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs" data-testid="google-last-error">
              {connection.lastSyncError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              data-testid="google-sync"
              onClick={() => startTransition(async () => setResult(await syncClassroom()))}
            >
              {pending ? "Reading Classroom…" : "Sync now"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await disconnectClassroom();
                  setDisconnected(true);
                  setResult(null);
                })
              }
            >
              Disconnect
            </Button>
          </div>

          {result && (
            <p
              className={`rounded-lg border p-3 text-xs ${
                result.ok ? "border-success/40 bg-success/10" : "border-danger/40 bg-danger/10"
              }`}
              data-testid="google-sync-result"
            >
              {summarise(result)}
            </p>
          )}

          <p className="text-xs text-muted">
            Imported work shows up under School. Disconnecting leaves it there — it is your work, not the
            connection&apos;s.
          </p>
        </>
      ) : (
        <>
          {/*
            A link, not a button with an action: the flow is a redirect to
            Google and back, which a server action cannot do.
          */}
          <a href="/api/google/start" className={configured ? "" : "pointer-events-none opacity-50"}>
            <Button size="sm" disabled={!configured} data-testid="google-connect">
              Connect Google Classroom
            </Button>
          </a>
          <p className="text-xs text-muted">
            You will be sent to Google to sign in and approve it. If your school manages your Google account, its
            administrator decides whether this is allowed at all — and if they say no, there is nothing this app can do
            about it.
          </p>
        </>
      )}
    </div>
  );
}
