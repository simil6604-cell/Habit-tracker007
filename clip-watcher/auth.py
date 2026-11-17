#!/usr/bin/env python3
"""Einmalige Anmeldung bei TikTok bzw. Instagram, um die Tokens für config.env zu bekommen.
Usage:  python3 auth.py tiktok      (braucht TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, REDIRECT_URI)
        python3 auth.py instagram   (braucht IG_APP_ID, IG_APP_SECRET, REDIRECT_URI)
REDIRECT_URI muss genau so in der App eingetragen sein (https). Nach dem Login landest du
auf dieser Seite; kopiere die komplette Adresse aus der Adresszeile hier hinein."""
import json, os, secrets, sys, urllib.parse, urllib.request

def ask_code(url):
    print("\n1) Diese Adresse im Browser öffnen und anmelden:\n" + url)
    back = input("\n2) Die komplette Adresse, auf der du gelandet bist, hier einfügen:\n> ").strip()
    code = urllib.parse.parse_qs(urllib.parse.urlparse(back).query).get("code", [""])[0]
    if not code:
        sys.exit("Kein code= in der Adresse gefunden.")
    return code.split("#")[0]

def post(url, fields):
    req = urllib.request.Request(url, urllib.parse.urlencode(fields).encode(),
                                 {"Content-Type": "application/x-www-form-urlencoded"})
    return json.load(urllib.request.urlopen(req, timeout=30))

def tiktok():
    key, secret, redir = os.environ["TIKTOK_CLIENT_KEY"], os.environ["TIKTOK_CLIENT_SECRET"], os.environ["REDIRECT_URI"]
    code = ask_code("https://www.tiktok.com/v2/auth/authorize/?" + urllib.parse.urlencode({
        "client_key": key, "scope": "user.info.basic,video.publish", "response_type": "code",
        "redirect_uri": redir, "state": secrets.token_hex(8)}))
    r = post("https://open.tiktokapis.com/v2/oauth/token/", {"client_key": key, "client_secret": secret,
             "code": code, "grant_type": "authorization_code", "redirect_uri": redir})
    print("\nIn config.env eintragen:\nTIKTOK_REFRESH_TOKEN=" + r["refresh_token"])

def instagram():
    app, secret, redir = os.environ["IG_APP_ID"], os.environ["IG_APP_SECRET"], os.environ["REDIRECT_URI"]
    code = ask_code("https://www.instagram.com/oauth/authorize?" + urllib.parse.urlencode({
        "client_id": app, "redirect_uri": redir, "response_type": "code",
        "scope": "instagram_business_basic,instagram_business_content_publish"}))
    short = post("https://api.instagram.com/oauth/access_token", {"client_id": app, "client_secret": secret,
                 "grant_type": "authorization_code", "redirect_uri": redir, "code": code})
    long = json.load(urllib.request.urlopen("https://graph.instagram.com/access_token?" + urllib.parse.urlencode({
        "grant_type": "ig_exchange_token", "client_secret": secret, "access_token": short["access_token"]})))
    print(f"\nIn config.env eintragen:\nIG_USER_ID={short['user_id']}\nIG_ACCESS_TOKEN={long['access_token']}")

if __name__ == "__main__":
    {"tiktok": tiktok, "instagram": instagram}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
