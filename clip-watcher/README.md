# Clip Watcher

Records a Twitch stream from the first second, logs chat anonymously, then clips every moment where chat explodes, with burned-in captions.

## Needs
`streamlink`, `ffmpeg` (with libass), `python3`, and optionally `whisper-cli` (whisper.cpp) plus a model such as `ggml-medium.en.bin`.

## Use
```bash
./watch.sh CHANNEL          # leave running overnight; waits until they go live
./clip.sh runs/CHANNEL-...  # after the stream ends (or any time during it)
```
Output: `runs/<run>/clips/NN-t<seconds>.mp4` and a `.credit.txt` with the channel link.

## How it works
1. `watch.sh` starts `chat.py` (IRC `irc.chat.twitch.tv:6667`, nick `justinfanNNNNN`, read-only, no token) and `streamlink ... --retry-streams 30`. It writes `start.txt` the moment the first video bytes arrive, so chat wall-clock times can be mapped to video offsets.
2. `spikes.py` counts messages per 10 s and flags bins that are at least 3x the previous 5 minutes' average, with at least 8 messages. Spikes within 60 s are merged.
3. `clip.sh` cuts 45 s starting 30 s before each spike (chat reacts after the moment), converts the audio to 16 kHz WAV for whisper, writes the `.srt`, and burns it in (this re-encodes; `-c copy` can't burn subtitles).

Tune `BIN`, `WINDOW`, `RATIO`, `MIN_MSGS` and `COOLDOWN` at the top of `spikes.py`.

## Rule
Clip, credit and link the streamer. Every clip gets a `.credit.txt`. Put it in your post.
