#!/usr/bin/env bash
# Usage: cut_one.sh RUN_DIR SECOND   schneidet 45 s ab SECOND-30 und transkribiert sie.
set -euo pipefail
RUN="$1"; sec="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
MODEL="${WHISPER_MODEL:-$HERE/ggml-medium.en.bin}"
cd "$RUN"; mkdir -p clips
ls clips/*-t"$sec".mp4 >/dev/null 2>&1 && exit 0   # schon geschnitten
CH="$(cat channel.txt 2>/dev/null || echo unknown)"
LINK="$(cat link.txt 2>/dev/null || echo "https://twitch.tv/$CH")"
n=$(( $(ls clips/ 2>/dev/null | grep -Ec -- '-t[0-9]+\.mp4$' || true) + 1 ))
ss=$(( sec > 30 ? sec - 30 : 0 ))
base="clips/$(printf %02d $n)-t${sec}"
echo "== Clip $n bei ${sec}s"
ffmpeg -nostdin -loglevel error -y -ss "$ss" -t 45 -i stream.ts -c copy "$base.raw.mp4"
mv "$base.raw.mp4" "$base.mp4"
if command -v whisper-cli >/dev/null && [ -f "$MODEL" ]; then
  ffmpeg -nostdin -loglevel error -y -i "$base.mp4" -ar 16000 -ac 1 "$base.wav"
  whisper-cli -m "$MODEL" -f "$base.wav" -osrt -of "$base" >/dev/null 2>&1 || true
  rm -f "$base.wav"
else
  echo "   (whisper-cli oder Modell fehlt: Clip ohne Untertitel)"
fi
printf 'Clip from %s (all credit to %s)\n' "$LINK" "$CH" > "$base.credit.txt"
