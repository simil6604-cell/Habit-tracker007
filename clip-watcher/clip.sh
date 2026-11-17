#!/usr/bin/env bash
# Usage: ./clip.sh runs/<run-dir> [model]
# Finds spikes, cuts 45 s clips (30 s before each spike), transcribes, scores,
# then publish.py edits the best ones to 9:16 and posts them.
set -euo pipefail
RUN="${1:?usage: ./clip.sh RUN_DIR [whisper-model]}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export WHISPER_MODEL="${2:-${WHISPER_MODEL:-$HERE/ggml-medium.en.bin}}"
[ -f "$HERE/config.env" ] && { set -a; . "$HERE/config.env"; set +a; }
cd "$RUN"
[ -f start.txt ] || { echo "no start.txt: stream never went live?"; exit 1; }
mkdir -p clips
CH="$(cat channel.txt 2>/dev/null || echo unknown)"
LINK="$(cat link.txt 2>/dev/null || echo "https://twitch.tv/$CH")"

python3 "$HERE/spikes.py" chat.log "$(cat start.txt)" | tee spikes.txt
while IFS=$'\t' read -r sec count _; do
  "$HERE/cut_one.sh" "$PWD" "$sec"
done < spikes.txt
echo "Fertig: Clips in $RUN/clips"
echo "== Viral-Prognose"
python3 "$HERE/score.py" . "${THRESHOLD:-75}"
echo "== Schnitt + Posten"
python3 "$HERE/publish.py" .
