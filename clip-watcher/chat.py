#!/usr/bin/env python3
"""Anonymous, read-only Twitch chat logger.
Usage: chat.py CHANNEL [chat.log]
Writes one line per message: <unix_time>\t<user>\t<text>
"""
import socket, sys, time

HOST, PORT = "irc.chat.twitch.tv", 6667

def run(channel, path):
    channel = channel.lower().lstrip("#")
    with open(path, "a", encoding="utf-8", buffering=1) as log:
        while True:
            try:
                s = socket.create_connection((HOST, PORT), timeout=360)
                s.sendall(f"NICK justinfan{int(time.time()) % 90000 + 10000}\r\nJOIN #{channel}\r\n".encode())
                print(f"[chat] connected to #{channel}", file=sys.stderr)
                buf = b""
                while True:
                    data = s.recv(4096)
                    if not data:
                        raise ConnectionError("server closed connection")
                    buf += data
                    *lines, buf = buf.split(b"\r\n")
                    for raw in lines:
                        line = raw.decode("utf-8", "replace")
                        if line.startswith("PING"):
                            s.sendall(("PONG" + line[4:] + "\r\n").encode())
                        elif " PRIVMSG #" in line:
                            # :user!user@user.tmi.twitch.tv PRIVMSG #chan :text
                            user = line[1:line.find("!")]
                            text = line.split(" :", 1)[1] if " :" in line else ""
                            log.write(f"{time.time():.3f}\t{user}\t{text.replace(chr(9), ' ')}\n")
            except (OSError, ConnectionError) as e:
                print(f"[chat] {e}; reconnecting in 5s", file=sys.stderr)
                time.sleep(5)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: chat.py CHANNEL [chat.log]")
    run(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "chat.log")
