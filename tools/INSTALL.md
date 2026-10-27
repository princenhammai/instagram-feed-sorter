# Video breakdown

Offline notes for Reels already downloaded with Instagram Feed Sorter. The script reads mp4 files on this computer. It does not upload them and it does not need an API key.

From a git checkout the script is `tools/breakdown.py`. From the release zip `instagram-feed-sorter-breakdown-v0.4.8.zip`, the same files sit in one folder and the command is `python3 breakdown.py`.

## What you need

- Python 3.9 or newer
- ffmpeg and ffprobe on your PATH

Optional, both free:

- tesseract, for words burned into the picture
- faster-whisper, for a local transcript, or whisper.cpp's `whisper-cli`

Contact sheets and scene cuts need only ffmpeg and ffprobe.

## Install

Debian, Ubuntu, and similar:

```sh
sudo apt-get install ffmpeg tesseract-ocr
python3 -m pip install -r requirements.txt
```

macOS (Homebrew):

```sh
brew install ffmpeg tesseract
python3 -m pip install -r requirements.txt
```

Windows: install ffmpeg and tesseract so both commands work in a terminal, then run `python -m pip install -r requirements.txt` in this folder.

Skip the pip line if you only want the contact sheet and scene cuts. The first transcript run downloads the Whisper model you name. `tiny` is the smaller one. `base` is slower and a closer listen.

## Run

```sh
python3 breakdown.py "/path/to/rank01_ada_AbC.mp4" --out breakdowns --whisper-model tiny
python3 breakdown.py ./downloads --whisper-model base
```

Each video gets a folder with `<name>.md`, `<name>.json`, `contact.jpg` (a frame about every 2 seconds), and `first-second.jpg`. Scene-cut times come from ffmpeg. On-screen text is read from full-size frames when tesseract is installed. `--whisper-model` is a faster-whisper model name, or the path of a whisper.cpp model when `whisper-cli` is on your PATH.

Download top N in the extension names files `rankNN_<handle>_<shortcode>.mp4`, which matches the command above.
