import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { HumanVoiceError, isHumanVoiceConfigured, MAX_SPEECH_CHARS, synthesizeSpeech } from "@/lib/ai/voice/human-voice";

/**
 * Turns a line of the assistant's reply into spoken audio.
 *
 * The browser asks this, and this asks ElevenLabs, so the key stays on the
 * server. Signed in only — the key is charged by the character, and an open
 * endpoint is somebody else's text-to-speech service running on this
 * account's credit.
 *
 * Every failure answers with a status the page can act on rather than an
 * error page: it falls back to the browser's own voice and carries on
 * talking, which is the whole point of not depending on this.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Not signed in", { status: 401 });

  if (!isHumanVoiceConfigured()) {
    // Not an error: the app works without it, and the page knows to use the
    // browser voice when it sees this.
    return new NextResponse("No human voice configured", { status: 503 });
  }

  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text : "";
  } catch {
    return new NextResponse("Expected JSON", { status: 400 });
  }
  if (!text.trim()) return new NextResponse("Nothing to say", { status: 400 });
  // Guarded here as well as when trimming, so a runaway request is refused
  // outright rather than quietly costing a thousand characters.
  if (text.length > MAX_SPEECH_CHARS * 4) return new NextResponse("Too much text to speak", { status: 413 });

  try {
    const upstream = await synthesizeSpeech(text, { signal: request.signal });
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
        // Someone's voice conversation is not something to leave lying in a
        // cache, and the service worker must never hold on to it.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const kind = error instanceof HumanVoiceError ? error.kind : "UNKNOWN";
    // The text itself is never logged: it is the conversation.
    console.error("[voice] speech failed:", kind);
    return new NextResponse(kind, { status: 502 });
  }
}
