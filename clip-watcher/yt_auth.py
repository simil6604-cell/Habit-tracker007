#!/usr/bin/env python3
"""Einmalig auf deinem Computer ausführen, um YT_REFRESH_TOKEN zu bekommen.
Usage: YT_CLIENT_ID=... YT_CLIENT_SECRET=... python3 yt_auth.py
Öffnet Google-Login im Browser; danach den angezeigten Token in config.env eintragen."""
import http.server, json, os, urllib.parse, urllib.request, webbrowser

CID, SECRET = os.environ["YT_CLIENT_ID"], os.environ["YT_CLIENT_SECRET"]
REDIRECT = "http://localhost:8765"
url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
    "client_id": CID, "redirect_uri": REDIRECT, "response_type": "code",
    "scope": "https://www.googleapis.com/auth/youtube.upload",
    "access_type": "offline", "prompt": "consent"})
code = {}

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code["c"] = q.get("code", [None])[0]
        self.send_response(200); self.end_headers()
        self.wfile.write("Fertig, du kannst dieses Fenster schließen.".encode())
    def log_message(self, *a): pass

print("Im Browser anmelden:\n" + url); webbrowser.open(url)
srv = http.server.HTTPServer(("localhost", 8765), H)
while not code.get("c"): srv.handle_request()
data = urllib.parse.urlencode({"code": code["c"], "client_id": CID, "client_secret": SECRET,
                               "redirect_uri": REDIRECT, "grant_type": "authorization_code"}).encode()
tok = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data))
print("\nIn config.env eintragen:\nYT_REFRESH_TOKEN=" + tok["refresh_token"])
