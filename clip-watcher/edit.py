#!/usr/bin/env python3
"""Hochformat-Schnitt (1080x1920) für Shorts / Reels / TikTok.
Usage: edit.py CLIP.mp4 "HOOK-TEXT" [OUT.mp4]
Unscharfer, vergrößerter Hintergrund, Video in der Mitte, Hook-Text oben,
große Untertitel unten (aus CLIP.srt, falls vorhanden).
"""
import os, subprocess, sys, tempfile

FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
         "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
         "C:/Windows/Fonts/arialbd.ttf"]

def esc(p):  # Pfad für ffmpeg-Filter escapen
    return p.replace("\\", "/").replace(":", r"\:").replace("'", r"\'")

def wrap(text, width=18):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur: lines.append(cur)
    return "\n".join(lines[:3])

def edit(clip, hook, out):
    font = next((f for f in FONTS if os.path.exists(f)), None)
    hookfile = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")
    hookfile.write(wrap(hook.upper())); hookfile.close()
    srt = clip.rsplit(".", 1)[0] + ".srt"

    f = ("[0:v]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:2,eq=brightness=-0.15,scale=1080:1920[bg];"
         "[0:v]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2")
    if hook.strip():
        f += (f",drawtext=textfile='{esc(hookfile.name)}'" + (f":fontfile='{esc(font)}'" if font else "") +
              ":fontsize=86:fontcolor=white:borderw=8:bordercolor=black:line_spacing=12"
              ":x=(w-text_w)/2:y=230")
    if os.path.exists(srt) and os.path.getsize(srt) > 0:
        f += (f",subtitles='{esc(srt)}':force_style='FontName=DejaVu Sans,Bold=1,FontSize=16,"
              "PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,"
              "Alignment=2,MarginV=55'")
    f += "[v]"
    cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", clip, "-filter_complex", f,
           "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]
    try:
        subprocess.run(cmd, check=True)
    finally:
        os.unlink(hookfile.name)
    return out

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit('usage: edit.py CLIP.mp4 "HOOK" [OUT.mp4]')
    clip = sys.argv[1]
    print(edit(clip, sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else clip.rsplit(".", 1)[0] + ".short.mp4"))
