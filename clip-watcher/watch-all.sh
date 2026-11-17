#!/usr/bin/env bash
# Überwacht alle Kanäle aus streamers.txt gleichzeitig clippt live und startet nach jedem Stream neu.
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/config.env" ] && { set -a; . "$HERE/config.env"; set +a; }
grep -v '^\s*\(#\|$\)' "$HERE/streamers.txt" | while read -r ch layout; do
  ( while true; do
      "$HERE/watch.sh" "$ch" "${layout:-crop}"
      sleep 60
    done ) > "$HERE/runs/${ch#@}.log" 2>&1 &
  echo "Überwache $ch (Log: runs/${ch#@}.log)"
done
wait
