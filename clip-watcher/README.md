# Clip Watcher

Records a Twitch stream from the first second, logs chat anonymously, then clips every moment where chat explodes, with burned-in captions.

## Needs
For emojis: `pip install pillow` and the font `fonts-noto-color-emoji` (without them clips are made without emojis).
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
`watch.sh` starts `live.py` next to the recording. Every 10 s it looks for new chat spikes. As soon as the chat has calmed down again, it cuts the clip (`cut_one.sh`), transcribes, scores, edits to 9:16 and posts it, while the stream keeps running. In a test, a moment was posted about 45 s after it happened, plus whisper time (depends on the server).

## How it works
1. `watch.sh` starts `chat.py` (IRC `irc.chat.twitch.tv:6667`, nick `justinfanNNNNN`, read-only, no token) and `streamlink ... --retry-streams 30`. It writes `start.txt` the moment the first video bytes arrive, so chat wall-clock times can be mapped to video offsets.
2. `spikes.py` counts messages per 10 s and flags bins that are at least 3x the previous 5 minutes' average, with at least 8 messages. A spike while chat is still going wild counts as the same moment.
3. Clip length follows the chat: from 15 s before the spike until 3 s after chat calms down, at least 30 s, at most 60 s (30-60 s performs best on Shorts, TikTok and Reels) (`MIN_LEN`/`MAX_LEN` in `spikes.py`). `cut_one.sh` cuts it, converts the audio to 16 kHz WAV for whisper and writes the `.srt` (burned in by `edit.py`).

4. `score.py` gives each clip a 0-100 virality estimate (chat spike, number of distinct chatters, reaction emotes, volume, speech in the first 3 s) and writes `scores.tsv`. Clips at or above `THRESHOLD` (default 75) are marked for posting. This is a heuristic, not a guarantee.

5. `publish.py` (runs automatically after `clip.sh`) takes every clip at or above `THRESHOLD`, edits it to 9:16 (`edit.py`: layout `crop` fills the screen for IRL/Just Chatting, `blur` keeps the whole frame for gameplay; hook text in a box at the top; word-by-word captions with the current word highlighted; zoom punch, shake and white flash at the peak; colour emojis in the hook, above captions when a matching word is said, and a big pop-up emoji at the peak chosen from the chat reaction (KEKW → 😂, NO WAY → 😱, W → 🔥 ...); own synthesized whoosh/boom/pop sound effects; credit; loudness normalised to -14 LUFS), uploads it to YouTube Shorts, TikTok and Instagram Reels (`PLATFORMS`) and sends you a Telegram message with the video. No confirmation needed. `MAX_PER_DAY` caps posts per day. `handled.txt` per run prevents double posts.

Tune `BIN`, `WINDOW`, `RATIO`, `MIN_MSGS` and `COOLDOWN` at the top of `spikes.py`.

Set the layout per channel in `streamers.txt` (`kaicenat crop`). Captions use the first installed font of Montserrat Black, Anton, Inter Black, Arial Black; install Montserrat on the server for the best look, or set `FONT=`.

## Check a clip
`python3 check.py clips/01-t120.short.mp4 --srt clips/01-t120.srt --hook "..." --png zones.png` checks it against the YouTube Shorts, TikTok and Reels specs (resolution, length, size, codec, loudness), checks that no text sits under the apps' buttons/caption area (approximate safe zones), prints a format score and saves a preview with the covered areas in red.

## Setup (once)
1. `cp config.env.example config.env`. Leave `DRY_RUN=1` until everything works.
2. **Telegram:** in Telegram open @BotFather, `/newbot`, put the token in `TELEGRAM_TOKEN`. Send your bot any message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id":...}` into `TELEGRAM_CHAT_ID`.
3. **YouTube:** console.cloud.google.com, new project, enable *YouTube Data API v3*, OAuth consent screen (add yourself as test user), create OAuth client of type *Desktop app*. Put ID/secret in `config.env`, then on your own computer run `YT_CLIENT_ID=... YT_CLIENT_SECRET=... python3 yt_auth.py` and copy the printed `YT_REFRESH_TOKEN`. Default quota allows about 6 uploads per day.
4. **TikTok:** developers.tiktok.com, create an app, add *Login Kit* and *Content Posting API* (Direct Post), scopes `user.info.basic` and `video.publish`, add an https redirect URI. Put key/secret and `REDIRECT_URI` in `config.env`, run `python3 auth.py tiktok`. Until TikTok audits your app, posts can only be private (`TIKTOK_PRIVACY=SELF_ONLY`); after the audit set `PUBLIC_TO_EVERYONE`.
5. **Instagram:** switch the account to Creator or Business. developers.facebook.com, create an app with *Instagram API with Instagram login*, permissions `instagram_business_basic` and `instagram_business_content_publish`, add the same redirect URI. Put app ID/secret in `config.env`, run `python3 auth.py instagram`. The token is renewed automatically (`runs/tokens.json`).
6. Set `DRY_RUN=0` and start `./watch-all.sh` on a server that runs 24/7.

## Rule
Clip, credit and link the streamer. Every clip gets a `.credit.txt`. Put it in your post.
