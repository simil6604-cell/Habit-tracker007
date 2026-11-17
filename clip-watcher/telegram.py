"""Telegram-Benachrichtigung. Braucht TELEGRAM_TOKEN (von @BotFather) und
TELEGRAM_CHAT_ID (deine Chat-ID, siehe README). Ohne beides: nur Ausgabe im Terminal."""
import json, os, urllib.request, uuid

def _api(method, fields, files=None):
    token = os.environ["TELEGRAM_TOKEN"]
    boundary = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, path in (files or {}).items():
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{os.path.basename(path)}"\r\n'
                 "Content-Type: video/mp4\r\n\r\n").encode() + open(path, "rb").read() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)

def send(text, video=None):
    if not (os.environ.get("TELEGRAM_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID")):
        print("[telegram nicht eingerichtet]\n" + text)
        return
    chat = os.environ["TELEGRAM_CHAT_ID"]
    try:
        # Telegram-Bots dürfen Videos bis 50 MB senden
        if video and os.path.getsize(video) < 49_000_000:
            _api("sendVideo", {"chat_id": chat, "caption": text[:1024], "supports_streaming": "true"}, {"video": video})
        else:
            _api("sendMessage", {"chat_id": chat, "text": text})
    except Exception as e:
        print(f"[telegram Fehler: {e}]\n{text}")
