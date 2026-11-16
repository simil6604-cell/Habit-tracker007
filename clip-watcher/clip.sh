#!/usr/bin/env bash
# Usage: ./clip.sh runs/<run-dir> [model]
# Finds spikes, cuts 45 s clips starting 30 s before each, captions and burns them in.
set -euo pipefail
RUN="${1:?usage: ./clip.sh RUN_DIR [whisper-model]}"
MODEL="${2:-${WHISPER_MODEL:-ggml-medium.en.bin}}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$RUN"
[ -f start.txt ] || { echo "no start.txt: stream never went live?"; exit 1; }
mkdir -p clips
CH="$(cat channel.txt 2>/dev/null || echo unknown)"

python3 "$HERE/spikes.py" chat.log "$(cat start.txt)" | tee spikes.txt
n=0
while IFS=$'\t' read -r sec count _; do
  n=$((n+1))
  ss=$(( sec > 30 ? sec - 30 : 0 ))
  base="clips/$(printf %02d $n)-t${sec}"
  echo "== clip $n at ${sec}s ($count msgs)"
  ffmpeg -nostdin -loglevel error -y -ss "$ss" -t 45 -i stream.ts -c copy "$base.raw.mp4"
  if command -v whisper-cli >/dev/null && [ -f "$MODEL" ]; then
    ffmpeg -nostdin -loglevel error -y -i "$base.raw.mp4" -ar 16000 -ac 1 "$base.wav"
    whisper-cli -m "$MODEL" -f "$base.wav" -osrt -of "$base" >/dev/null 2>&1
    ffmpeg -nostdin -loglevel error -y -i "$base.raw.mp4" \
      -vf "subtitles=$base.srt:force_style='FontSize=22,Outline=2'" \
      -c:v libx264 -preset veryfast -crf 20 -c:a copy "$base.mp4"
    rm -f "$base.wav" "$base.raw.mp4"
  else
    echo "   (whisper-cli or model missing: keeping uncaptioned clip)"
    mv "$base.raw.mp4" "$base.mp4"
  fi
  printf 'Clip from https://twitch.tv/%s (all credit to %s)\n' "$CH" "$CH" > "$base.credit.txt"
done < spikes.txt
echo "Done: $n clips in $RUN/clips"
