#!/usr/bin/env python3
"""Viral-Prognose: gibt jedem Clip eines Runs eine Punktzahl von 0-100.
Usage: score.py RUN_DIR [schwelle=60]
Liest chat.log, start.txt, spikes.txt und clips/*.srt, schreibt scores.tsv
(nach Punktzahl sortiert) und listet die Clips über der Schwelle.

Das ist eine Heuristik, keine Garantie. stats.py soll später die Gewichte
anhand echter Aufrufe nachjustieren.
"""
import glob, math, os, re, sys

WEIGHTS = {"ausschlag": 0.30, "leute": 0.25, "reaktion": 0.20, "menge": 0.15, "hook": 0.10}
REACT = re.compile(r"\b(LUL|LULW|KEKW|OMEGALUL|LMAO+|LOL+|xd+|W+|POG\w*|Pog\w*|Clap|monkaS|NOWAY|ICANT|"
                   r"WHAT|holy|bro+|nah+)\b|!{2,}|\?{2,}", re.I)
PRE, POST = 5, 25          # Fenster um den Ausschlag (Sekunden)
BASE = 300                 # Vergleichszeitraum davor

def load_chat(path):
    msgs = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            p = line.rstrip("\n").split("\t", 2)
            if len(p) == 3:
                try: msgs.append((float(p[0]), p[1], p[2]))
                except ValueError: pass
    return msgs

def clamp(x): return max(0.0, min(1.0, x))

def hook(srt):
    """Wird in den ersten 3 Sekunden gesprochen? 1 = ja, 0 = nein, 0.5 = unbekannt."""
    if not srt or not os.path.exists(srt): return 0.5
    m = re.search(r"(\d\d):(\d\d):(\d\d)[,.](\d+)\s*-->", open(srt, encoding="utf-8", errors="replace").read())
    if not m: return 0.0
    h, mi, s, ms = map(int, m.groups())
    return 1.0 if h * 3600 + mi * 60 + s + ms / 1000 < 3 else 0.0

def score(msgs, t, srt):
    win = [m for m in msgs if t - PRE <= m[0] < t + POST]
    base = [m for m in msgs if t - BASE <= m[0] < t - PRE]
    span = PRE + POST
    rate = len(win) / span
    base_rate = len(base) / (BASE - PRE) if base else 0.05
    uniq = len({m[1] for m in win})
    base_uniq = len({m[1] for m in base}) * span / (BASE - PRE) if base else 1
    react = sum(1 for m in win if REACT.search(m[2])) / len(win) if win else 0

    f = {
        "ausschlag": clamp(math.log(max(rate / max(base_rate, 0.05), 1)) / math.log(15)),
        "leute":     clamp(math.log(max(uniq / max(base_uniq, 1), 1)) / math.log(10)),
        "reaktion":  clamp(react / 0.5),
        "menge":     clamp(math.log10(max(len(win), 1)) / math.log10(300)),
        "hook":      hook(srt),
    }
    return round(100 * sum(WEIGHTS[k] * v for k, v in f.items())), f, len(win), uniq

def main(run, threshold=60):
    msgs = load_chat(os.path.join(run, "chat.log"))
    start = float(open(os.path.join(run, "start.txt")).read())
    rows = []
    for line in open(os.path.join(run, "spikes.txt")):
        sec = int(line.split("\t")[0])
        clip = (glob.glob(os.path.join(run, "clips", f"*-t{sec}.mp4")) or [f"t{sec}"])[0]
        s, f, n, u = score(msgs, start + sec, clip.rsplit(".", 1)[0] + ".srt")
        rows.append((s, os.path.basename(clip), sec, n, u, f))
    rows.sort(reverse=True)
    with open(os.path.join(run, "scores.tsv"), "w") as out:
        out.write("score\tprognose\tclip\tsekunde\tnachrichten\tleute\t" + "\t".join(WEIGHTS) + "\n")
        for s, clip, sec, n, u, f in rows:
            label = "hoch" if s >= 75 else "mittel" if s >= 50 else "niedrig"
            out.write(f"{s}\t{label}\t{clip}\t{sec}\t{n}\t{u}\t" + "\t".join(f"{f[k]:.2f}" for k in WEIGHTS) + "\n")
            mark = "POSTEN " if s >= threshold else "       "
            print(f"{mark}{s:3d}/100 {label:7s} {clip}  ({n} Nachr., {u} Leute)")

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit("usage: score.py RUN_DIR [schwelle]")
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 60)
