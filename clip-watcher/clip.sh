#!/usr/bin/env bash
# Usage: ./clip.sh runs/<run-dir> [model]
# Finds spikes, cuts 45 s clips (30 s before each spike), transcribes, scores,
# then publish.py edits the best ones to 9:16 and posts them.
set -euo pipefail
RUN="${1:?usage: ./clip.sh RUN_DIR [whisper-model]}"
MODEL="${2:-${WHISPER_MODEL:-ggml-medium.en.bin}}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/config.env" ] && { set -a; . "$HERE/config.env"; set +a; }
cd "$RUN"
[ -f start.txt ] || { echo "no start.txt: stream never went live?"; exit 1; }
mkdir -p clips
CH="$(cat channel.txt 2>/dev/null || echo unknown)"
LINK="$(cat link.txt 2>/dev/null || echo "https://twitch.tv/$CH")"

python3 "$HERE/spikes.py" chat.log "$(cat start.txt)" | tee spikes.txt
n=0
while IFS=$'\t' read -r sec count _; do
  n=$((n+1))
  ss=$(( sec > 30 ? sec - 30 : 0 ))
  base="clips/$(printf %02d $n)-t${sec}"
  echo "== clip $n at ${sec}s ($count msgs)"
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
done < spikes.txt
echo "Done: $n clips in $RUN/clips"
echo "== Viral-Prognose"
python3 "$HERE/score.py" . "${THRESHOLD:-75}"
echo "== Schnitt + Posten"
python3 "$HERE/publish.py" .
