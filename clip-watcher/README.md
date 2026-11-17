# Clip Watcher

Records a Twitch stream from the first second, logs chat anonymously, then clips every moment where chat explodes, with burned-in captions.

## Needs
`streamlink`, `ffmpeg` (with libass), `python3`, and optionally `whisper-cli` (whisper.cpp) plus a model such as `ggml-medium.en.bin`.

## Use
```bash
./watch.sh kaicenat         # Twitch channel; waits until they go live, clips + posts LIVE
./watch.sh @IShowSpeed      # YouTube handle (needs: pip install chat-downloader)
./clip.sh runs/NAME-...     # optional: re-process a finished run
./watch-all.sh              # watch every channel in streamers.txt, clip after each stream
```
Output: `runs/<run>/clips/NN-t<seconds>.mp4` and a `.credit.txt` with the channel link.

## Live mode
`watch.sh` starts `live.py` next to the recording. Every 10 s it looks for new chat spikes. As soon as the 15 s after a spike are recorded, it cuts the clip (`cut_one.sh`), transcribes, scores, edits to 9:16 and posts it, while the stream keeps running. In a test, a moment was posted about 45 s after it happened, plus whisper time (depends on the server).

## How it works
1. `watch.sh` starts `chat.py` (IRC `irc.chat.twitch.tv:6667`, nick `justinfanNNNNN`, read-only, no token) and `streamlink ... --retry-streams 30`. It writes `start.txt` the moment the first video bytes arrive, so chat wall-clock times can be mapped to video offsets.
2. `spikes.py` counts messages per 10 s and flags bins that are at least 3x the previous 5 minutes' average, with at least 8 messages. Spikes within 60 s are merged.
3. `clip.sh` cuts 45 s starting 30 s before each spike (chat reacts after the moment), converts the audio to 16 kHz WAV for whisper, writes the `.srt`, and burns it in (this re-encodes; `-c copy` can't burn subtitles).

4. `score.py` gives each clip a 0-100 virality estimate (chat spike, number of distinct chatters, reaction emotes, volume, speech in the first 3 s) and writes `scores.tsv`. Clips at or above `THRESHOLD` (default 60) are marked for posting. This is a heuristic, not a guarantee.

5. `publish.py` (runs automatically after `clip.sh`) takes every clip at or above `THRESHOLD`, edits it to 9:16 (`edit.py`: blurred background, hook text from the most common chat reaction, big captions), uploads it and sends you a Telegram message with the video. No confirmation needed. `MAX_PER_DAY` caps posts per day. `runs/posted.log` prevents double posts.

Tune `BIN`, `WINDOW`, `RATIO`, `MIN_MSGS` and `COOLDOWN` at the top of `spikes.py`.

## Setup (once)
1. `cp config.env.example config.env`. Leave `DRY_RUN=1` until everything works.
2. **Telegram:** in Telegram open @BotFather, `/newbot`, put the token in `TELEGRAM_TOKEN`. Send your bot any message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id":...}` into `TELEGRAM_CHAT_ID`.
3. **YouTube:** console.cloud.google.com, new project, enable *YouTube Data API v3*, OAuth consent screen (add yourself as test user), create OAuth client of type *Desktop app*. Put ID/secret in `config.env`, then on your own computer run `YT_CLIENT_ID=... YT_CLIENT_SECRET=... python3 yt_auth.py` and copy the printed `YT_REFRESH_TOKEN`. Default quota allows about 6 uploads per day.
4. Set `DRY_RUN=0` and start `./watch-all.sh` on a server that runs 24/7.

## Rule
Clip, credit and link the streamer. Every clip gets a `.credit.txt`. Put it in your post.
