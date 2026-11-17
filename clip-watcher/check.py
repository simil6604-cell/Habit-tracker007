#!/usr/bin/env python3
"""Prüft einen fertigen Clip für YouTube Shorts, TikTok und Instagram Reels.
Usage: check.py SHORT.mp4 [--srt CLIP.srt] [--hook TEXT] [--png vorschau.png]

1. Technische Vorgaben jeder Plattform (Format, Länge, Codec, Größe, Lautstärke).
2. Sichere Bereiche: liegt Text unter den Buttons / dem Namen der Plattform?
3. Format-Score 0-100: wie gut der Schnitt die bekannten Muster erfolgreicher Clips trifft.
Die Bereiche sind Näherungen der gängigen Safe-Zone-Vorlagen; die Apps ändern ihr Layout ab und zu.
"""
import argparse, json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edit

W, H = 1080, 1920
# Verdeckte Bereiche: (x1, y1, x2, y2) in Pixeln bei 1080x1920
ZONES = {
    "TikTok":    [(0, 0, W, 150), (0, H - 480, W, H), (940, 700, W, H - 480)],
    "Reels":     [(0, 0, W, 210), (0, H - 440, W, H), (950, 900, W, H - 440)],
    "Shorts":    [(0, 0, W, 160), (0, H - 420, W, H), (940, 800, W, H - 420)],
}
LIMITS = {  # max. Länge in s, max. Dateigröße in MB (Upload über die offizielle API)
    "TikTok": (600, 4000), "Reels": (900, 300), "Shorts": (180, 256000),
}

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
                         capture_output=True, text=True).stdout
    return json.loads(out)

def loudness(path):
    err = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", path, "-af", "ebur128", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    return float(m[-1]) if m else None

def faststart(path):
    head = open(path, "rb").read(2_000_000)
    return head.find(b"moov") != -1 and (head.find(b"mdat") == -1 or head.find(b"moov") < head.find(b"mdat"))

def text_boxes():
    """Rendert jedes Textelement (mit langen Beispieltexten) einzeln und misst, wo es landet."""
    font = edit.pick_font()
    samples = {
        "Hook": ("WENN DER CHAT KOMPLETT AUSRASTET UND KEINER ES GLAUBT", [], ""),
        "Untertitel": ("", [(0.0, 0.5, "UNBELIEVABLE"), (0.5, 1.0, "ABSOLUTELY"), (1.0, 3.0, "INCREDIBLE")], ""),
        "Credit": ("", [], "twitch.tv/averyveryverylongchannelname"),
    }
    boxes = {}
    for name, (hook, words, credit) in samples.items():
        ass = tempfile.NamedTemporaryFile(suffix=".ass", delete=False).name
        edit.build_ass(ass, hook, words, credit, 3.0, font)
        raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i",
                              f"color=black:s={W}x{H}:d=3", "-vf", f"subtitles='{edit.esc(ass)}'",
                              "-ss", "1.2", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                             capture_output=True).stdout
        os.unlink(ass)
        xs, ys = [], []
        for y in range(0, H, 2):
            row = raw[y * W:(y + 1) * W]
            hits = [x for x in range(0, W, 2) if row[x] > 40]
            if hits:
                xs += [hits[0], hits[-1]]; ys.append(y)
        if ys:
            boxes[name] = (min(xs), min(ys), max(xs), max(ys))
    return boxes

def overlap(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--srt"); ap.add_argument("--hook", default="")
    ap.add_argument("--png")
    a = ap.parse_args()
    info = probe(a.video)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    au = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    dur = float(info["format"]["duration"]); size_mb = os.path.getsize(a.video) / 1e6
    fps = eval(v["avg_frame_rate"]) if v.get("avg_frame_rate", "0/0") != "0/0" else 0
    mbps = float(info["format"].get("bit_rate", 0)) / 1e6
    lufs = loudness(a.video)
    words = edit.read_words(a.srt) if a.srt else []
    boxes = text_boxes()

    ok = lambda b: "✅" if b else "❌"
    common = [
        (v["width"] == W and v["height"] == H, f"Auflösung {v['width']}x{v['height']} (Ziel 1080x1920, 9:16)"),
        (v["codec_name"] == "h264" and v.get("pix_fmt") == "yuv420p", f"Video {v['codec_name']} {v.get('pix_fmt')}"),
        (23 <= fps <= 60, f"{fps:.0f} fps (23-60)"),
        (au is not None and au["codec_name"] == "aac" and int(au.get("sample_rate", 0)) <= 48000,
         f"Ton {au['codec_name'] if au else 'fehlt'} {au.get('sample_rate', '') if au else ''} Hz"),
        (mbps <= 25, f"Bitrate {mbps:.1f} Mbit/s (Reels max. 25)"),
        (lufs is not None and -16 <= lufs <= -12, f"Lautheit {lufs} LUFS (Ziel -14)"),
        (faststart(a.video), "Schnellstart (moov vorne, lädt sofort)"),
    ]
    print(f"\n== {os.path.basename(a.video)}: {dur:.1f} s, {size_mb:.1f} MB")
    for good, text in common:
        print(f"  {ok(good)} {text}")
    for p, zones in ZONES.items():
        maxlen, maxmb = LIMITS[p]
        hidden = [n for n, b in boxes.items() for z in zones if overlap(b, z)]
        print(f"  {p:7s} {ok(dur <= maxlen)} Länge ≤ {maxlen} s  {ok(size_mb <= maxmb)} Größe ≤ {maxmb} MB  "
              f"{ok(not hidden)} " + ("Text frei von Buttons/Name" if not hidden else "verdeckt: " + ", ".join(sorted(set(hidden)))))

    # Format-Score: Muster erfolgreicher Clips (Länge, Untertitel, Hook, Ton, Lesbarkeit)
    speech_early = bool(words) and words[0][0] < 3
    safe = all(not overlap(b, z) for zs in ZONES.values() for z in zs for b in boxes.values())
    parts = [
        (25, 30 <= dur <= 60, "Länge 30-60 s"),
        (20, len(words) >= 5, "Untertitel vorhanden"),
        (15, speech_early, "Gesprochen in den ersten 3 s"),
        (15, bool(a.hook.strip()), "Hook-Text oben"),
        (15, safe, "Kein Text verdeckt"),
        (10, lufs is not None and -16 <= lufs <= -12, "Lautheit passt"),
    ]
    fscore = sum(p for p, good, _ in parts if good)
    print(f"  Format-Score {fscore}/100: " + ", ".join(f"{ok(g)} {t}" for _, g, t in parts))

    if a.png:   # Vorschau: Bild aus dem Clip mit den verdeckten Bereichen jeder Plattform
        t = min(2.0, dur / 2)
        inputs, chains = [], []
        for i, (p, zones) in enumerate(ZONES.items()):
            inputs += ["-ss", str(t), "-i", a.video]
            boxes_f = ",".join(f"drawbox=x={x1}:y={y1}:w={x2-x1}:h={y2-y1}:color=red@0.35:t=fill" for x1, y1, x2, y2 in zones)
            label = f"drawtext=text='{p}':fontsize=70:fontcolor=white:borderw=5:x=(w-text_w)/2:y=40"
            chains.append(f"[{i}:v]trim=end_frame=1,{boxes_f},{label},scale=360:-2[v{i}]")
        f = ";".join(chains) + ";[v0][v1][v2]hstack=3"
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", *inputs, "-filter_complex", f,
                        "-frames:v", "1", a.png], check=True)
        print(f"  Vorschau: {a.png}")
    return fscore

if __name__ == "__main__":
    main()
