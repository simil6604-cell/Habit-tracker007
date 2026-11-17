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
LEAD = 25         # Sekunden vor dem Ausschlag (Chat reagiert verzögert)
TAIL = 5          # Sekunden nach dem Ende der Chat-Reaktion
MIN_LEN = 30      # Clip mindestens so lang
MAX_LEN = 90      # und höchstens so lang

def find_spikes(path, start=None, until=None):
    """Liste von (sekunde, anzahl, schnitt, länge). sekunde = Beginn des Ausschlags
    (ab Aufnahmestart, oder Unix-Zeit ohne start). länge = Cliplänge in Sekunden,
    None solange der Chat noch reagiert (Live-Modus). until: nur Daten vor dieser Unix-Zeit."""
    out = []
    times = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                times.append(float(line.split("\t", 1)[0]))
            except ValueError:
                pass
    if until is not None:
        times = [t for t in times if t < until // BIN * BIN]
    if not times:
        return out
    t0 = int(min(times)) // BIN * BIN
    counts = [0] * ((int(max(times)) - t0) // BIN + 1)
    for t in times:
        counts[(int(t) - t0) // BIN] += 1
    if until is not None:   # leere, aber schon abgeschlossene Zeitfenster am Ende mitzählen
        counts += [0] * max(0, (int(until) // BIN * BIN - t0) // BIN - len(counts))

    busy_until = None
    for i in range(WINDOW, len(counts)):
        avg = sum(counts[i - WINDOW:i]) / WINDOW
        c = counts[i]
        t = t0 + i * BIN
        if busy_until is not None and t < busy_until:
            continue
        if not (c >= MIN_MSGS and c >= RATIO * max(avg, 0.1)):
            continue
        if counts[i - 1] >= max(RATIO * max(avg, 0.1), MIN_MSGS):
            continue  # Chat war schon vorher am Ausrasten: gleicher Moment, kein neuer
        # Wie lange reagiert der Chat? Ende = erstes Zeitfenster, das wieder ruhig ist.
        quiet = max(RATIO / 2 * avg, MIN_MSGS / 2)
        clip_start = t - LEAD
        end = next((t0 + j * BIN for j in range(i + 1, len(counts)) if counts[j] < quiet), None)
        if end is None and until is None:
            end = t0 + len(counts) * BIN          # Aufnahme vorbei: bis zum Ende
        if end is None and (t0 + len(counts) * BIN) - clip_start >= MAX_LEN:
            end = clip_start + MAX_LEN            # reagiert sehr lange: bei MAX_LEN abschneiden
        length = None if end is None else int(min(MAX_LEN, max(MIN_LEN, end + TAIL - clip_start)))
        busy_until = clip_start + (length or MAX_LEN)
        when = t - start if start is not None else t
        if when < 0:
            continue  # chat before recording began
        out.append((int(when), c, avg, length))
    return out

def main(path, start=None):
    for when, c, avg, length in find_spikes(path, start):
        print(f"{when}\t{c}\t(avg {avg:.1f})\t{length}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: spikes.py chat.log [stream_start_epoch]")
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else None)
