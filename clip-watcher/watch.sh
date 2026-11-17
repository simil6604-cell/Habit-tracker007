#!/usr/bin/env bash
# Usage: ./watch.sh CHANNEL [crop|blur]   Twitch, z.B. ./watch.sh kaicenat
#        crop = Bild füllt Hochformat (IRL/Just Chatting), blur = ganzes Bild + unscharfer Rand (Gameplay)
#        ./watch.sh @HANDLE        YouTube, z.B. ./watch.sh @IShowSpeed
# Wartet, bis der Kanal live geht, nimmt auf, loggt den Chat und clippt + postet
# jeden Moment schon während des Streams (live.py). Alles in runs/<name>-<datum>/.
set -euo pipefail
CH="${1:?usage: ./watch.sh CHANNEL | @YOUTUBE_HANDLE [crop|blur]}"
LAYOUT_ARG="${2:-${LAYOUT:-crop}}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/config.env" ] && { set -a; . "$HERE/config.env"; set +a; }

if [[ "$CH" == @* ]]; then
  NAME="${CH#@}"; URL="https://www.youtube.com/$CH/live"; LINK="https://www.youtube.com/$CH"
  CHAT_CMD=(python3 "$HERE/chat_yt.py" "$URL" chat.log)
  SL_EXTRA=()
else
  NAME="$CH"; URL="twitch.tv/$CH"; LINK="https://twitch.tv/$CH"
  CHAT_CMD=(python3 "$HERE/chat.py" "$CH" chat.log)
  SL_EXTRA=(--twitch-disable-ads)
fi

RUN="$HERE/runs/$NAME-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN"; cd "$RUN"
echo "$NAME" > channel.txt; echo "$LINK" > link.txt; echo "$LAYOUT_ARG" > layout.txt

"${CHAT_CMD[@]}" 2> chat.err &
CHAT=$!
trap 'kill $CHAT 2>/dev/null || true' EXIT

# Zeitpunkt der ersten Videodaten: Chat-Zeit minus diesen Wert = Position im Video.
( while [ ! -s stream.ts ]; do sleep 0.5; done; date +%s.%N > start.txt ) &

# Live-Modus: Clips schneiden und posten, während der Stream läuft.
python3 "$HERE/live.py" "$RUN" &
LIVE=$!

echo "Aufnahme nach $RUN (warte, bis $NAME live geht)..."
streamlink "$URL" best -o stream.ts --retry-streams 30 "${SL_EXTRA[@]}" || true
touch ended
wait $LIVE
echo "Stream vorbei, alle Clips verarbeitet: $RUN/clips"
