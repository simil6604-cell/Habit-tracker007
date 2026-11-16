#!/usr/bin/env python3
"""Find chat spikes.
Usage: spikes.py chat.log [stream_start_epoch]
Counts messages per 10 s bin and flags bins with >= 3x the average of the
previous 5 minutes. Prints one spike per line: seconds into the recording
(if start time given) or unix time, then the message count.
"""
import sys

BIN = 10          # seconds per bin
WINDOW = 30       # bins of history (30 x 10 s = 5 min)
RATIO = 3.0       # spike = RATIO x trailing average
MIN_MSGS = 8      # ignore tiny spikes (0 -> 2 messages is not a moment)
COOLDOWN = 60     # seconds; merge spikes closer than this into one

def main(path, start=None):
    times = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                times.append(float(line.split("\t", 1)[0]))
            except ValueError:
                pass
    if not times:
        return
    t0 = int(min(times)) // BIN * BIN
    counts = [0] * ((int(max(times)) - t0) // BIN + 1)
    for t in times:
        counts[(int(t) - t0) // BIN] += 1

    last = None
    for i in range(WINDOW, len(counts)):
        avg = sum(counts[i - WINDOW:i]) / WINDOW
        c = counts[i]
        if c >= MIN_MSGS and c >= RATIO * max(avg, 0.1):
            t = t0 + i * BIN
            if last is not None and t - last < COOLDOWN:
                continue
            last = t
            when = t - start if start is not None else t
            if when < 0:
                continue  # chat before recording began
            print(f"{when:.0f}\t{c}\t(avg {avg:.1f})")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: spikes.py chat.log [stream_start_epoch]")
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else None)
