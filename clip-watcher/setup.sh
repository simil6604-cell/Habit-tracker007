#!/usr/bin/env bash
# Einmalige Einrichtung auf einem frischen Ubuntu-Server (22.04 / 24.04), als root ausführen:
#   sudo ./setup.sh
# Installiert ffmpeg, Schriften, Python-Pakete, whisper.cpp + Modell und den Dienst,
# der rund um die Uhr läuft und nach einem Neustart von selbst wieder startet.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODEL="${MODEL:-small.en}"     # small.en = schnell + gut; medium.en = genauer, aber ~3x langsamer

echo "== Systempakete"
apt-get update
apt-get install -y ffmpeg python3 python3-venv git cmake build-essential fontconfig \
  fonts-noto-color-emoji fonts-montserrat

echo "== Python-Umgebung (streamlink, chat-downloader, pillow)"
python3 -m venv "$HERE/venv"
"$HERE/venv/bin/pip" install --upgrade pip
"$HERE/venv/bin/pip" install streamlink chat-downloader pillow

echo "== whisper.cpp (Untertitel)"
if [ ! -x "$HERE/whisper.cpp/build/bin/whisper-cli" ]; then
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$HERE/whisper.cpp"
  cmake -S "$HERE/whisper.cpp" -B "$HERE/whisper.cpp/build" -DCMAKE_BUILD_TYPE=Release
  cmake --build "$HERE/whisper.cpp/build" -j"$(nproc)" --config Release
fi
ln -sf "$HERE/whisper.cpp/build/bin/whisper-cli" /usr/local/bin/whisper-cli
[ -f "$HERE/whisper.cpp/models/ggml-$MODEL.bin" ] || sh "$HERE/whisper.cpp/models/download-ggml-model.sh" "$MODEL"

echo "== config.env"
[ -f "$HERE/config.env" ] || cp "$HERE/config.env.example" "$HERE/config.env"
grep -q '^WHISPER_MODEL=' "$HERE/config.env" || echo "WHISPER_MODEL=$HERE/whisper.cpp/models/ggml-$MODEL.bin" >> "$HERE/config.env"
chmod 600 "$HERE/config.env"
mkdir -p "$HERE/runs"

echo "== Dienst clip-watcher (läuft 24/7, startet nach Neustart automatisch)"
cat > /etc/systemd/system/clip-watcher.service <<UNIT
[Unit]
Description=Clip Watcher (Streams clippen und posten)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$HERE
Environment=PATH=$HERE/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$HERE/watch-all.sh
Restart=always
RestartSec=30
KillMode=control-group

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable clip-watcher

echo
echo "Fertig. Jetzt:"
echo "  1) nano $HERE/config.env   (Telegram, YouTube, TikTok, Instagram eintragen, DRY_RUN=1 lassen)"
echo "  2) systemctl start clip-watcher"
echo "  3) Logs ansehen: tail -f $HERE/runs/*.log"
