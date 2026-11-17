"""Erzeugt Profilbild (1080x1080) und YouTube-Banner (2560x1440) für den Clip-Kanal."""
import subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

NAME = sys.argv[1] if len(sys.argv) > 1 else "CHAT WENT CRAZY"
TAG = sys.argv[2] if len(sys.argv) > 2 else "THE CRAZIEST STREAM MOMENTS. EVERY DAY."
YELLOW, DARK, DARK2, RED = (255, 229, 0), (14, 14, 20), (38, 30, 70), (255, 59, 48)

def font(fam, size):
    path = subprocess.run(["fc-match", "-f", "%{file}", fam], capture_output=True, text=True).stdout
    return ImageFont.truetype(path, size)

def emoji(ch, px):
    f = ImageFont.truetype(subprocess.run(["fc-match", "-f", "%{file}", "Noto Color Emoji"],
                                          capture_output=True, text=True).stdout, 109)
    im = Image.new("RGBA", (180, 160)); ImageDraw.Draw(im).text((10, 10), ch, font=f, embedded_color=True)
    im = im.crop(im.getbbox())
    return im.resize((round(im.width * px / im.height), px), Image.LANCZOS)

def gradient(w, h):
    g = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(DARK2[i] * (1 - t) + DARK[i] * t) for i in range(3)))
    return g.convert("RGBA")

def bubble(d, box, fill):
    x1, y1, x2, y2 = box
    d.rounded_rectangle(box, radius=int((y2 - y1) * 0.28), fill=fill)
    w = x2 - x1   # Sprechblasen-Spitze unten links
    d.polygon([(x1 + w * 0.18, y2 - 10), (x1 + w * 0.40, y2 - 10), (x1 + w * 0.12, y2 + (y2 - y1) * 0.30)], fill=fill)

# ---------- Profilbild ----------
S = 1080
img = gradient(S, S)
glow = Image.new("RGBA", (S, S)); ImageDraw.Draw(glow).ellipse((190, 150, 890, 850), fill=YELLOW + (90,))
img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(120)))
d = ImageDraw.Draw(img)
# Schatten + Sprechblase
sh = Image.new("RGBA", (S, S)); bubble(ImageDraw.Draw(sh), (232, 262, 862, 702), (0, 0, 0, 140))
img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)))
bubble(d, (220, 240, 860, 680), YELLOW)
e = emoji("💀", 300); img.alpha_composite(e, ((220 + 860 - e.width) // 2, (240 + 680 - e.height) // 2))
# LIVE-Pille unten (bleibt im runden Ausschnitt sichtbar)
f = font("Inter Display Black", 76)
tw = d.textlength("LIVE", font=f)
px1, py1 = (S - tw - 150) / 2, 800
d.rounded_rectangle((px1, py1, px1 + tw + 150, py1 + 110), radius=55, fill=RED)
d.ellipse((px1 + 34, py1 + 37, px1 + 70, py1 + 73), fill="white")
d.text((px1 + 100, py1 + 8), "LIVE", font=f, fill="white")
img.convert("RGB").save("profilbild.png")

# Vorschau, wie es rund aussieht
mask = Image.new("L", (S, S)); ImageDraw.Draw(mask).ellipse((0, 0, S, S), fill=255)
rund = Image.new("RGBA", (S, S), (255, 255, 255, 0)); rund.paste(img, mask=mask)
rund.resize((360, 360), Image.LANCZOS).save("profilbild_rund_vorschau.png")

# ---------- YouTube-Banner ----------
W, H = 2560, 1440
b = gradient(W, H)
glow = Image.new("RGBA", (W, H)); ImageDraw.Draw(glow).ellipse((700, 420, 1860, 1020), fill=YELLOW + (60,))
b.alpha_composite(glow.filter(ImageFilter.GaussianBlur(160)))
d = ImageDraw.Draw(b)
# Deko-Emojis außen (nur auf TV/Desktop sichtbar)
for ch, x, y, s in (("😂", 230, 300, 230), ("😱", 2100, 260, 220), ("🔥", 330, 900, 200), ("💀", 2150, 880, 230)):
    b.alpha_composite(emoji(ch, s), (x, y))
# Inhalt im sicheren Bereich (1546x423 in der Mitte)
size = 150
while True:   # Logo + Name müssen in 1546 px passen (mit Rand)
    f1 = font("Inter Display Black", size)
    tw = d.textlength(NAME, font=f1)
    logo = int(size * 0.95)
    if logo + 36 + tw <= 1440:
        break
    size -= 4
f2 = font("Inter Display Black", 50)
x = (W - (logo + 36 + tw)) / 2
top = 590 - size // 2 + 40
bubble(d, (x, top, x + logo, top + int(logo * 0.9)), YELLOW)
e = emoji("💀", int(logo * 0.62)); b.alpha_composite(e, (int(x + (logo - e.width) / 2), int(top + (logo * 0.9 - e.height) / 2)))
d.text((x + logo + 36, top - size * 0.12), NAME, font=f1, fill="white")
t2 = d.textlength(TAG, font=f2)
d.text(((W - t2) / 2, 760), TAG, font=f2, fill=YELLOW)
b.convert("RGB").save("youtube_banner.png")
# Vorschau mit sicherem Bereich
p = b.copy(); ImageDraw.Draw(p).rectangle(((W - 1546) / 2, (H - 423) / 2, (W + 1546) / 2, (H + 423) / 2), outline=RED, width=6)
p.convert("RGB").resize((960, 540), Image.LANCZOS).save("youtube_banner_vorschau.png")
print("ok")
