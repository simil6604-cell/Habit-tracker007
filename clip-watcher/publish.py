#!/usr/bin/env python3
"""Vollautomatisch: schneidet die besten Clips eines Runs ins Hochformat, postet sie
und schickt dir eine Telegram-Nachricht. Keine Bestätigung nötig.
Usage: publish.py RUN_DIR
Einstellungen (Umgebungsvariablen, z.B. in config.env):
  THRESHOLD=75      nur Clips mit mindestens dieser Prognose posten
  MAX_PER_DAY=5     höchstens so viele Posts pro Tag (Spam-Schutz, YouTube-Kontingent)
  DRY_RUN=1         nichts hochladen, nur anzeigen (Standard, bis du DRY_RUN=0 setzt)
"""
import collections, datetime, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edit, score, telegram, youtube

HERE = os.path.dirname(os.path.abspath(__file__))
POSTED = os.path.join(HERE, "runs", "posted.log")
STOP = {"ok", "lol", "w", "l", "?", "hi", "yo", "f"}

def hook_from_chat(msgs, t):
    """Häufigste kurze Chat-Reaktion rund um den Moment, z.B. 'KEKW NO WAY'."""
    c = collections.Counter()
    for ts, _, text in msgs:
        if t - 5 <= ts < t + 25:
            k = re.sub(r"\s+", " ", text.strip())
            if 2 <= len(k) <= 28 and k.lower() not in STOP and "http" not in k:
                c[k.upper()] += 1
    return c.most_common(1)[0][0] if c else "CHAT IST AUSGERASTET"

def posted_today():
    today = datetime.date.today().isoformat()
    if not os.path.exists(POSTED): return set(), 0
    lines = [l.rstrip("\n").split("\t") for l in open(POSTED, encoding="utf-8")]
    return {l[1] for l in lines if len(l) > 1}, sum(1 for l in lines if l[0].startswith(today))

def main(run):
    threshold = int(os.environ.get("THRESHOLD", 75))
    max_day = int(os.environ.get("MAX_PER_DAY", 5))
    dry = os.environ.get("DRY_RUN", "1") != "0"
    name = open(os.path.join(run, "channel.txt")).read().strip()
    link = open(os.path.join(run, "link.txt")).read().strip() if os.path.exists(os.path.join(run, "link.txt")) else f"https://twitch.tv/{name}"
    platform = "youtube" if "youtube.com" in link else "twitch"
    msgs = score.load_chat(os.path.join(run, "chat.log"))
    start = float(open(os.path.join(run, "start.txt")).read())
    done, today = posted_today()

    rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(run, "scores.tsv"), encoding="utf-8")][1:]
    for r in rows:
        s, label, clipname, sec = int(r[0]), r[1], r[2], int(r[3])
        clip = os.path.join(run, "clips", clipname)
        key = os.path.abspath(clip)
        if s < threshold or key in done or not os.path.exists(clip):
            continue
        if today >= max_day:
            telegram.send(f"⏸ Tageslimit ({max_day}) erreicht, {name} {clipname} ({s}/100) nicht gepostet.")
            break

        hook = hook_from_chat(msgs, start + sec)
        short = edit.edit(clip, hook, clip.rsplit(".", 1)[0] + ".short.mp4")
        tag = re.sub(r"\W", "", name.lower())
        title = f"{hook.title()} 💀 | {name}"
        desc = (f"{name} live: {link}\nAlle Rechte und Credits an {name}. Folgt {name}!\n\n"
                f"#{tag} #{platform} #clips #shorts")
        tags = [name, tag, platform, "clips", "shorts"]

        results = []
        if dry:
            results.append("Testmodus (DRY_RUN=1): nichts hochgeladen")
        else:
            if youtube.configured():
                try: results.append("YouTube: " + youtube.upload(short, title, desc, tags))
                except Exception as e: results.append(f"YouTube: Fehler {e}")
            else:
                results.append("YouTube: nicht eingerichtet")
            results.append("Instagram: kommt als Nächstes")
            results.append("TikTok: kommt als Nächstes")

        telegram.send(f"🔥 {name}: {s}/100 ({label})\n„{title}“\n" + "\n".join(results), short)
        if not dry:
            with open(POSTED, "a", encoding="utf-8") as f:
                f.write(f"{datetime.datetime.now().isoformat(timespec='seconds')}\t{key}\t{s}\n")
            today += 1

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit("usage: publish.py RUN_DIR")
    main(sys.argv[1])
