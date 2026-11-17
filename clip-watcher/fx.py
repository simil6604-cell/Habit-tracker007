"""Effekte für virale Clips: farbige Emojis (als Bilder), Hook-Box mit Emoji,
eigene Soundeffekte (Boom, Whoosh, Pop, selbst erzeugt, keine fremden Sounds).
Braucht Pillow und die Schrift 'Noto Color Emoji' (fonts-noto-color-emoji).
Fehlt etwas, liefern die Funktionen None und der Schnitt läuft ohne Emojis weiter."""
import os, re, subprocess

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")

# Chat-Reaktion -> Emoji für den Höhepunkt
REACTION_EMOJI = [
    (r"KEKW|LUL|OMEGALUL|LMAO|LOL|ICANT|😂|🤣|HAHA|XD", "😂"),
    (r"💀|DEAD|DIED|☠", "💀"),
    (r"NO ?WAY|WHAT|HOLY|NAH|😱|😳|OMG|WTF", "😱"),
    (r"\bW\b|POG|GOAT|🔥|LETS ?GO|HYPE", "🔥"),
    (r"\bL\b|RIP|😭|SAD", "😭"),
    (r"MONKAS|SCARY|😨", "😨"),
]
# Wörter in den Untertiteln -> Emoji darüber
WORD_EMOJI = {
    "FIRE": "🔥", "HOT": "🥵", "MONEY": "💰", "CASH": "💰", "RICH": "🤑", "DOLLARS": "💵",
    "CRAZY": "🤯", "INSANE": "🤯", "WHAT": "😳", "WAIT": "⏳", "NO": "🚫", "DEAD": "💀",
    "LAUGH": "😂", "FUNNY": "😂", "LOVE": "❤️", "HEART": "❤️", "GOD": "🙏", "PRAY": "🙏",
    "CAR": "🚗", "FOOD": "🍔", "EAT": "🍔", "HUNGRY": "🍔", "SLEEP": "😴", "TIRED": "😴",
    "WIN": "🏆", "WON": "🏆", "GOAL": "⚽", "BALL": "⚽", "RONALDO": "⚽", "MESSI": "⚽",
    "SCARED": "😨", "SCARY": "😨", "COLD": "🥶", "SICK": "🤢", "KING": "👑", "GOAT": "🐐",
    "BRO": "😭", "CHAT": "💬", "PHONE": "📱", "GIRL": "💅", "MOM": "👩", "POLICE": "🚓",
    "FIGHT": "🥊", "GUN": "🔫", "CRY": "😭", "CRYING": "😭", "SHOCK": "😱", "BOOM": "💥",
}

def _fc_file(family):
    try:
        return subprocess.run(["fc-match", "-f", "%{file}", family], capture_output=True, text=True).stdout.strip() or None
    except OSError:
        return None

def _pil():
    try:
        from PIL import Image, ImageDraw, ImageFont
        return Image, ImageDraw, ImageFont
    except ImportError:
        return None

def _emoji_font():
    p = _fc_file("Noto Color Emoji")
    return p if p and "emoji" in p.lower() else None

def available():
    return _pil() is not None and _emoji_font() is not None

def peak_emoji(texts):
    """Häufigste Reaktionsart im Chat -> passendes Emoji."""
    counts = {}
    for t in texts:
        for pat, e in REACTION_EMOJI:
            if re.search(pat, t, re.I):
                counts[e] = counts.get(e, 0) + 1
                break
    return max(counts, key=counts.get) if counts else "😱"

def word_emoji(words):
    for w in words:
        e = WORD_EMOJI.get(re.sub(r"[^A-Z]", "", w.upper()))
        if e:
            return e
    return None

def emoji_png(ch, px, out):
    """Ein Emoji als PNG mit Transparenz, px Pixel hoch."""
    pil, font = _pil(), _emoji_font()
    if not pil or not font:
        return None
    Image, ImageDraw, ImageFont = pil
    f = ImageFont.truetype(font, 109)          # Noto Color Emoji gibt es nur in Größe 109
    img = Image.new("RGBA", (180, 160), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((10, 10), ch, font=f, embedded_color=True)
    img = img.crop(img.getbbox())
    img = img.resize((max(1, round(img.width * px / img.height)), px), Image.LANCZOS)
    img.save(out)
    return out

def hook_png(text, emoji, font_family, out, max_w=780, size=78):
    """Hook als Bild: weiße fette Schrift in abgerundeter schwarzer Box, farbiges Emoji am Ende."""
    pil = _pil()
    font_file = _fc_file(font_family)
    if not pil or not font_file:
        return None
    Image, ImageDraw, ImageFont = pil
    f = ImageFont.truetype(font_file, size)
    draw = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    em_w = int(size * 1.15) if emoji and _emoji_font() else 0
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = f"{cur} {w}".strip()
        if cur and draw.textlength(test, font=f) > max_w:
            lines.append(cur); cur = w
        else:
            cur = test
    if cur:
        lines.append(cur)
    lines = lines[:3]
    if em_w and draw.textlength(lines[-1], font=f) + em_w > max_w:
        lines.append("")
    pad, gap, lh = 34, 14, int(size * 1.15)
    widths = [draw.textlength(l, font=f) for l in lines]
    widths[-1] += em_w + (12 if em_w and lines[-1] else 0)
    bw, bh = int(max(widths)) + 2 * pad, len(lines) * lh + (len(lines) - 1) * gap + 2 * pad
    img = Image.new("RGBA", (bw + 16, bh + 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((8, 14, bw + 8, bh + 14), radius=28, fill=(0, 0, 0, 90))         # Schatten
    d.rounded_rectangle((4, 4, bw + 4, bh + 4), radius=28, fill=(12, 12, 12, 235))
    y = 4 + pad
    for i, l in enumerate(lines):
        x = 4 + (bw - widths[i]) / 2
        d.text((x, y - size * 0.08), l, font=f, fill="white")
        if i == len(lines) - 1 and em_w:
            e = emoji_png(emoji, int(size * 1.05), out + ".e.png")
            if e:
                ei = Image.open(e)
                img.alpha_composite(ei, (int(x + draw.textlength(l, font=f) + (12 if l else 0)), int(y)))
                os.unlink(e)
        y += lh + gap
    img.save(out)
    return out

def sfx():
    """Erzeugt Boom / Whoosh / Pop einmalig in assets/ und gibt die Pfade zurück."""
    os.makedirs(ASSETS, exist_ok=True)
    defs = {
        "boom":   ["-f", "lavfi", "-i", "aevalsrc='0.95*sin(2*PI*(45+90*exp(-9*t))*t)*exp(-3.5*t)':s=48000:d=1.4"],
        "whoosh": ["-f", "lavfi", "-i", "anoisesrc=d=0.55:c=pink:a=0.8:r=48000",
                   "-af", "highpass=f=400,lowpass=f=5000,afade=t=in:d=0.35,afade=t=out:st=0.35:d=0.2,volume=0.7"],
        "pop":    ["-f", "lavfi", "-i", "aevalsrc='0.7*sin(2*PI*(1400-900*t/0.09)*t)*exp(-35*t)':s=48000:d=0.12"],
    }
    paths = {}
    for name, args in defs.items():
        p = os.path.join(ASSETS, f"{name}.wav")
        if not os.path.exists(p):
            subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", *args, "-ac", "2", p], check=True)
        paths[name] = p
    return paths
