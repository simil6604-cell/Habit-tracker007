#!/usr/bin/env python3
"""Professioneller Hochformat-Schnitt (1080x1920) für Shorts / Reels / TikTok.
Usage: edit.py CLIP.mp4 "HOOK" [OUT.mp4] [--layout crop|blur] [--peak SEK] [--credit TEXT]

  - Layout "crop": Bild füllt den ganzen Screen (IRL, Just Chatting, Facecam groß).
    Layout "blur": ganzes Bild in der Mitte, unscharfer Hintergrund (Gameplay).
  - Hook-Text oben in einer Box, die ganze Zeit sichtbar.
  - Untertitel Wort für Wort (3 Wörter pro Zeile, aktuelles Wort gelb + größer).
  - Zoom-Punch beim Höhepunkt (--peak), Credit unter den Untertiteln.
  - Alle Texte außerhalb der Bereiche, die TikTok / Reels / Shorts überdecken.
  - Ton auf -14 LUFS normalisiert (Plattform-Standard).
"""
import argparse, os, re, subprocess, tempfile

W, H, FPS = 1080, 1920, 30
# Positionen so gewählt, dass TikTok / Reels / Shorts nichts davon verdecken (check.py prüft das):
HOOK_TOP = 240          # Hook-Box oben, unter "Für dich / Folge ich" bzw. Reels-Kopfzeile
CAP_BOTTOM = 600        # Untertitel: Abstand vom unteren Rand (unten liegen Name + Beschreibung)
CREDIT_BOTTOM = 520     # Credit direkt unter den Untertiteln
SIDE = 150              # links/rechts frei (rechts sind Like-/Kommentar-Buttons)
FONTS = ["Montserrat Black", "Montserrat ExtraBold", "Anton", "Inter Display Black",
         "Inter Black", "Arial Black", "DejaVu Sans"]

def pick_font():
    if os.environ.get("FONT"):
        return os.environ["FONT"]
    try:
        have = subprocess.run(["fc-list", ":", "family"], capture_output=True, text=True).stdout
    except OSError:
        return "Arial"
    names = {n.strip() for line in have.splitlines() for n in line.split(",")}
    return next((f for f in FONTS if f in names), "Arial")

def clean(text):
    """Emojis und Steuerzeichen raus (werden eingebrannt nicht farbig dargestellt)."""
    text = "".join(ch for ch in text if ord(ch) < 0x2000 or 0x3000 <= ord(ch) < 0xD800)
    return re.sub(r"\s+", " ", text.replace("{", "(").replace("}", ")")).strip()

def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path], capture_output=True, text=True).stdout
    return float(out.strip() or 0)

def read_words(srt):
    """Wörter mit Zeiten aus SRT. Whisper mit -ml 1 liefert ein Wort pro Eintrag;
    längere Einträge werden gleichmäßig auf ihre Wörter verteilt."""
    if not srt or not os.path.exists(srt):
        return []
    words = []
    blocks = re.split(r"\n\s*\n", open(srt, encoding="utf-8", errors="replace").read().strip())
    for b in blocks:
        m = re.search(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)\s*\n(.*)", b, re.S)
        if not m:
            continue
        g = list(map(int, m.groups()[:8]))
        a = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        e = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        ws = clean(m.group(9).replace("\n", " ")).split()
        for i, w in enumerate(ws):
            step = (e - a) / len(ws)
            words.append((a + i * step, a + (i + 1) * step, w.upper()))
    return words

def ts(t):
    t = max(t, 0)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"

def build_ass(path, hook, words, credit, dur, font):
    hook = clean(hook).upper()
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "WrapStyle: 0",
        "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        # Hook: weiße Schrift in schwarzer Box oben
        f"Style: Hook,{font},80,&H00FFFFFF,&H00FFFFFF,&H1A000000,&H1A000000,1,0,0,0,100,100,0,0,3,22,0,8,{SIDE},{SIDE},{HOOK_TOP},1",
        # Untertitel: dicker schwarzer Rand + Schatten, unteres Drittel
        f"Style: Cap,{font},96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,1,7,4,2,{SIDE},{SIDE},{CAP_BOTTOM},1",
        f"Style: Credit,{font},34,&H30FFFFFF,&H30FFFFFF,&H80000000,&H00000000,1,0,0,0,100,100,0,0,1,3,0,2,{SIDE},{SIDE},{CREDIT_BOTTOM},1",
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    if hook:
        # kurzes Reinzoomen am Anfang
        lines.append(f"Dialogue: 1,{ts(0)},{ts(dur)},Hook,,0,0,0,,"
                     r"{\fscx80\fscy80\t(0,180,\fscx100\fscy100)}" + hook)
    # Wörter in Gruppen von max. 3 (neue Gruppe auch bei Sprechpause > 0.6 s)
    groups, cur = [], []
    for w in words:
        if cur and (len(cur) == 3 or w[0] - cur[-1][1] > 0.6):
            groups.append(cur); cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    for g in groups:
        for i, (a, e, _) in enumerate(g):
            end = g[i + 1][0] if i + 1 < len(g) else e + 0.15
            parts = []
            for j, (_, _, w) in enumerate(g):
                if j == i:
                    parts.append(r"{\c&H00E5FF&\fscx112\fscy112\t(0,90,\fscx122\fscy122)\t(90,180,\fscx112\fscy112)}"
                                 + w + r"{\r}")
                else:
                    parts.append(w)
            lines.append(f"Dialogue: 0,{ts(a)},{ts(end)},Cap,,0,0,0,,{' '.join(parts)}")
    if credit:
        lines.append(f"Dialogue: 0,{ts(0)},{ts(dur)},Credit,,0,0,0,,{clean(credit)}")
    open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")

def esc(p):
    return p.replace("\\", "/").replace(":", r"\:").replace("'", r"\'")

def edit(clip, hook, out, layout="crop", peak=None, credit=""):
    dur = duration(clip)
    font = pick_font()
    ass = tempfile.NamedTemporaryFile("w", suffix=".ass", delete=False).name
    build_ass(ass, hook, read_words(clip.rsplit(".", 1)[0] + ".srt"), credit, dur, font)

    if layout == "blur":
        f = (f"[0:v]fps={FPS},split[a][b];"
             "[a]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:2,"
             f"eq=brightness=-0.18,scale={W}:{H}[bg];"
             f"[b]scale={W}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2-80")
    else:  # crop: Bild füllt den Screen, Mitte bleibt
        f = f"[0:v]fps={FPS},scale=-2:{H},crop={W}:{H}"
    f += ",eq=contrast=1.06:saturation=1.15"
    if peak is not None and 0 < peak < dur:
        # Zoom-Punch: in 0.2 s auf 115 %, 1.5 s halten, in 0.4 s zurück
        a = peak
        z = (f"if(between(in/{FPS},{a},{a+0.2}),1+0.15*(in/{FPS}-{a})/0.2,"
             f"if(between(in/{FPS},{a+0.2},{a+1.7}),1.15,"
             f"if(between(in/{FPS},{a+1.7},{a+2.1}),1.15-0.15*(in/{FPS}-{a+1.7})/0.4,1)))")
        f += (f",zoompan=z='{z}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}")
    f += f",subtitles='{esc(ass)}'[v]"
    cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", clip, "-filter_complex", f,
           "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
           "-profile:v", "high", "-pix_fmt", "yuv420p", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out]
    try:
        subprocess.run(cmd, check=True)
    finally:
        os.unlink(ass)
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("clip"); ap.add_argument("hook"); ap.add_argument("out", nargs="?")
    ap.add_argument("--layout", default=os.environ.get("LAYOUT", "crop"), choices=["crop", "blur"])
    ap.add_argument("--peak", type=float); ap.add_argument("--credit", default="")
    a = ap.parse_args()
    print(edit(a.clip, a.hook, a.out or a.clip.rsplit(".", 1)[0] + ".short.mp4", a.layout, a.peak, a.credit))
