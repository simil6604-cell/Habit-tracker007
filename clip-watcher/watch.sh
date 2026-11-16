#!/usr/bin/env bash
# Usage: ./watch.sh CHANNEL
# Waits for CHANNEL to go live, records the stream and logs chat into runs/<channel>-<date>/.
set -euo pipefail
CH="${1:?usage: ./watch.sh CHANNEL}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RUN="$HERE/runs/$CH-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN"; cd "$RUN"
echo "$CH" > channel.txt

python3 "$HERE/chat.py" "$CH" chat.log 2> chat.err &
CHAT=$!
trap 'kill $CHAT 2>/dev/null || true' EXIT

# Note when the first bytes land in stream.ts: chat times minus this = video offset.
( while [ ! -s stream.ts ]; do sleep 0.5; done; date +%s.%N > start.txt ) &

echo "Recording into $RUN (waiting for $CH to go live)..."
streamlink "twitch.tv/$CH" best -o stream.ts --retry-streams 30 --twitch-disable-ads
echo "Stream ended. Now run: ./clip.sh $RUN"
