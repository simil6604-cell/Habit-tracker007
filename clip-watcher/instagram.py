"""Instagram-Reels-Upload über die offizielle Instagram API (Instagram-Login, Creator-/Business-Account).
Braucht IG_USER_ID und IG_ACCESS_TOKEN (Einrichtung: README, auth.py). Das Token gilt 60 Tage
und wird hier automatisch erneuert. Lädt die Datei direkt hoch, kein öffentlicher Link nötig."""
import json, os, time, urllib.parse, urllib.request
import tokens

API = "https://graph.instagram.com/" + os.environ.get("IG_API_VERSION", "v23.0")

def configured():
    return bool(tokens.get("IG_USER_ID") and tokens.get("IG_ACCESS_TOKEN"))

def _call(method, path, tok, params=None, data=None, headers=None, url=None):
    q = dict(params or {}, access_token=tok)
    full = url or f"{API}{path}?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(full, data, method=method, headers=headers or {})
    try:
        return json.load(urllib.request.urlopen(req, timeout=600))
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode(errors="replace")[:300])

def _token():
    tok = tokens.get("IG_ACCESS_TOKEN")
    last = float(tokens.get("IG_REFRESHED_AT") or 0)
    if time.time() - last > 7 * 86400:          # einmal pro Woche erneuern (gilt 60 Tage)
        r = _call("GET", "", tok, url="https://graph.instagram.com/refresh_access_token?" +
                  urllib.parse.urlencode({"grant_type": "ig_refresh_token", "access_token": tok}))
        tok = r["access_token"]
        tokens.put(IG_ACCESS_TOKEN=tok, IG_REFRESHED_AT=str(time.time()))
    return tok

def upload(video, title, description, tags):
    tok, uid = _token(), tokens.get("IG_USER_ID")
    caption = (title + "\n\n" + description)[:2200]
    c = _call("POST", f"/{uid}/media", tok, {"media_type": "REELS", "upload_type": "resumable",
                                             "caption": caption, "share_to_feed": "true"})
    size = os.path.getsize(video)
    with open(video, "rb") as f:
        _call("POST", "", tok, url=c["uri"], data=f.read(),
              headers={"Authorization": f"OAuth {tok}", "offset": "0", "file_size": str(size)})
    for _ in range(60):   # bis zu 5 Minuten auf die Verarbeitung warten
        s = _call("GET", f"/{c['id']}", tok, {"fields": "status_code,status"})
        if s.get("status_code") == "FINISHED":
            break
        if s.get("status_code") == "ERROR":
            raise RuntimeError(s.get("status"))
        time.sleep(5)
    else:
        raise RuntimeError("Instagram hat das Video nicht rechtzeitig verarbeitet")
    p = _call("POST", f"/{uid}/media_publish", tok, {"creation_id": c["id"]})
    m = _call("GET", f"/{p['id']}", tok, {"fields": "permalink"})
    return m.get("permalink", "gepostet")
