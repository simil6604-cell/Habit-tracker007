"""YouTube-Upload über die offizielle YouTube Data API v3 (ohne Zusatzpakete).
Braucht YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (Einrichtung: README)."""
import json, os, urllib.parse, urllib.request

def configured():
    return all(os.environ.get(k) for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"))

def _token():
    data = urllib.parse.urlencode({"client_id": os.environ["YT_CLIENT_ID"],
                                   "client_secret": os.environ["YT_CLIENT_SECRET"],
                                   "refresh_token": os.environ["YT_REFRESH_TOKEN"],
                                   "grant_type": "refresh_token"}).encode()
    with urllib.request.urlopen("https://oauth2.googleapis.com/token", data, timeout=30) as r:
        return json.load(r)["access_token"]

def upload(video, title, description, tags):
    tok = _token()
    meta = {"snippet": {"title": title[:100], "description": description[:5000], "tags": tags,
                        "categoryId": "20"},  # 20 = Gaming
            "status": {"privacyStatus": os.environ.get("YT_PRIVACY", "public"),
                       "selfDeclaredMadeForKids": False}}
    req = urllib.request.Request(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        data=json.dumps(meta).encode(), method="POST",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8",
                 "X-Upload-Content-Type": "video/mp4",
                 "X-Upload-Content-Length": str(os.path.getsize(video))})
    with urllib.request.urlopen(req, timeout=60) as r:
        location = r.headers["Location"]
    with open(video, "rb") as f:
        put = urllib.request.Request(location, data=f.read(), method="PUT",
                                     headers={"Authorization": f"Bearer {tok}", "Content-Type": "video/mp4"})
    with urllib.request.urlopen(put, timeout=600) as r:
        vid = json.load(r)["id"]
    return f"https://youtube.com/shorts/{vid}"
