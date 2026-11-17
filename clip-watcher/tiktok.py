"""TikTok-Upload über die offizielle Content Posting API (Direct Post).
Braucht TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN (Einrichtung: README, auth.py).
Solange TikTok deine App nicht geprüft hat, sind nur private Posts erlaubt: TIKTOK_PRIVACY=SELF_ONLY."""
import json, math, os, time, urllib.parse, urllib.request
import tokens

API = "https://open.tiktokapis.com/v2"

def configured():
    return bool(os.environ.get("TIKTOK_CLIENT_KEY") and os.environ.get("TIKTOK_CLIENT_SECRET")
                and tokens.get("TIKTOK_REFRESH_TOKEN"))

def _access_token():
    data = urllib.parse.urlencode({"client_key": os.environ["TIKTOK_CLIENT_KEY"],
                                   "client_secret": os.environ["TIKTOK_CLIENT_SECRET"],
                                   "grant_type": "refresh_token",
                                   "refresh_token": tokens.get("TIKTOK_REFRESH_TOKEN")}).encode()
    req = urllib.request.Request(f"{API}/oauth/token/", data,
                                 {"Content-Type": "application/x-www-form-urlencoded"})
    r = json.load(urllib.request.urlopen(req, timeout=30))
    if "access_token" not in r:
        raise RuntimeError(f"Token-Erneuerung fehlgeschlagen: {r}")
    tokens.put(TIKTOK_REFRESH_TOKEN=r.get("refresh_token") or tokens.get("TIKTOK_REFRESH_TOKEN"))
    return r["access_token"]

def _post(path, tok, body):
    req = urllib.request.Request(f"{API}{path}", json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {tok}",
                                          "Content-Type": "application/json; charset=UTF-8"})
    r = json.load(urllib.request.urlopen(req, timeout=60))
    if r.get("error", {}).get("code", "ok") != "ok":
        raise RuntimeError(r["error"])
    return r["data"]

def upload(video, title, description, tags):
    tok = _access_token()
    info = _post("/post/publish/creator_info/query/", tok, {})   # Pflicht vor jedem Post
    privacy = os.environ.get("TIKTOK_PRIVACY", "SELF_ONLY")
    if privacy not in info.get("privacy_level_options", [privacy]):
        privacy = "SELF_ONLY"
    size = os.path.getsize(video)
    chunk = size if size <= 64_000_000 else 10_000_000            # TikTok: Stücke 5-64 MB
    count = 1 if chunk == size else size // chunk                 # Rest geht ins letzte Stück
    caption = (title + "\n" + description)[:2200]
    d = _post("/post/publish/video/init/", tok, {
        "post_info": {"title": caption, "privacy_level": privacy,
                      "disable_duet": False, "disable_comment": False, "disable_stitch": False},
        "source_info": {"source": "FILE_UPLOAD", "video_size": size,
                        "chunk_size": chunk, "total_chunk_count": count}})
    with open(video, "rb") as f:
        for i in range(count):
            first = i * chunk
            last = size - 1 if i == count - 1 else first + chunk - 1
            f.seek(first)
            part = f.read(last - first + 1)
            req = urllib.request.Request(d["upload_url"], part, method="PUT", headers={
                "Content-Type": "video/mp4", "Content-Length": str(len(part)),
                "Content-Range": f"bytes {first}-{last}/{size}"})
            urllib.request.urlopen(req, timeout=600).read()
    for _ in range(60):   # bis zu 5 Minuten auf die Verarbeitung warten
        s = _post("/post/publish/status/fetch/", tok, {"publish_id": d["publish_id"]})
        if s.get("status") == "PUBLISH_COMPLETE":
            return f"gepostet ({privacy})"
        if s.get("status") == "FAILED":
            raise RuntimeError(s.get("fail_reason", "FAILED"))
        time.sleep(5)
    return f"hochgeladen, TikTok verarbeitet noch ({d['publish_id']})"
