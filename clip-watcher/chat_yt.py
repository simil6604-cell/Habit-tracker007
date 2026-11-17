#!/usr/bin/env python3
"""YouTube-Live-Chat-Logger (ohne Login), gleiches Format wie chat.py.
Usage: chat_yt.py URL [chat.log]   z.B. https://www.youtube.com/@IShowSpeed/live
Braucht: pip install chat-downloader
Wartet und versucht es alle 30 s erneut, solange der Kanal nicht live ist.
"""
import sys, time
from chat_downloader import ChatDownloader

def run(url, path):
    with open(path, "a", encoding="utf-8", buffering=1) as log:
        while True:
            try:
                chat = ChatDownloader().get_chat(url, message_groups=["messages"])
                print(f"[chat] verbunden: {url}", file=sys.stderr)
                for m in chat:
                    ts = m.get("timestamp")
                    t = ts / 1e6 if ts else time.time()
                    user = (m.get("author") or {}).get("name", "?").replace("\t", " ")
                    text = (m.get("message") or "").replace("\t", " ").replace("\n", " ")
                    log.write(f"{t:.3f}\t{user}\t{text}\n")
                print("[chat] Chat beendet; neuer Versuch in 30 s", file=sys.stderr)
            except Exception as e:  # nicht live, Netzwerkfehler, ...
                print(f"[chat] {type(e).__name__}: {e}; neuer Versuch in 30 s", file=sys.stderr)
            time.sleep(30)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: chat_yt.py URL [chat.log]")
    run(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "chat.log")
