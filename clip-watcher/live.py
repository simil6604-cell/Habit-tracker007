#!/usr/bin/env python3
"""Live-Modus: schneidet, bewertet und postet jeden Moment, während der Stream noch läuft.
Usage: live.py RUN_DIR      (startet watch.sh automatisch)
Ablauf alle 10 s: neue Chat-Ausschläge suchen -> sobald die
Chat-Reaktion vorbei ist, Clip (30-90 s) schneiden -> transkribieren -> Prognose -> Hochformat -> posten.
Endet, wenn watch.sh die Datei RUN_DIR/ended anlegt (nach einem letzten Durchgang).
"""
import os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spikes

BUFFER = 10          # Sekunden Puffer, bis das Clip-Ende sicher aufgenommen ist

def step(run, start, final=False):
    path = os.path.join(run, "chat.log")
    if not os.path.exists(path):
        return
    now = time.time()
    found = spikes.find_spikes(path, start, until=None if final else now)
    done_file = os.path.join(run, "spikes.txt")
    done = {int(l.split("\t")[0]) for l in open(done_file)} if os.path.exists(done_file) else set()
    new = False
    for sec, c, avg, length in found:
        if sec in done or length is None:      # length None: Chat reagiert noch
            continue
        clip_end = start + max(sec - spikes.LEAD, 0) + length
        if not final and clip_end + BUFFER > now:
            continue
        subprocess.run([os.path.join(HERE, "cut_one.sh"), run, str(sec), str(length)], check=False)
        with open(done_file, "a") as f:
            f.write(f"{sec}\t{c}\t(avg {avg:.1f})\t{length}\n")
        done.add(sec); new = True
    if new:
        subprocess.run([sys.executable, os.path.join(HERE, "score.py"), run,
                        os.environ.get("THRESHOLD", "75")], check=False)
        subprocess.run([sys.executable, os.path.join(HERE, "publish.py"), run], check=False)

def main(run):
    start_file, ended = os.path.join(run, "start.txt"), os.path.join(run, "ended")
    while not os.path.exists(start_file):
        if os.path.exists(ended):
            return
        time.sleep(5)
    start = float(open(start_file).read())
    print(f"[live] Stream läuft, suche Momente...", flush=True)
    while not os.path.exists(ended):
        try:
            step(run, start)
        except Exception as e:
            print(f"[live] Fehler: {e}", flush=True)
        time.sleep(10)
    step(run, start, final=True)
    print("[live] Stream vorbei, alle Momente verarbeitet.", flush=True)

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit("usage: live.py RUN_DIR")
    main(os.path.abspath(sys.argv[1]))
