# YouTube Summarizer — CLI

Python CLI that fetches YouTube transcripts and summarizes them with OpenAI models.
It also powers the [web UI](../web-ui) — the Next.js API routes shell out to this script.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your OpenAI API key
```

## Usage

```bash
# Summarize a video (URL or bare video ID)
python youtube_summarizer.py summarize "https://www.youtube.com/watch?v=VIDEO_ID"

# Pick a summary style: concise | detailed | bullet-points | key-insights
python youtube_summarizer.py summarize VIDEO_ID --type key-insights

# Prefer specific transcript languages
python youtube_summarizer.py summarize VIDEO_ID -l en -l de

# Use a different model, save to a file, include the transcript
python youtube_summarizer.py summarize VIDEO_ID -m gpt-4o -o summary.txt --show-transcript

# List available transcript languages
python youtube_summarizer.py list-transcripts VIDEO_ID

# Fetch the raw transcript only (no OpenAI call)
python youtube_summarizer.py transcript VIDEO_ID -o transcript.txt
```

Supported URL forms: `watch?v=`, `youtu.be/`, `shorts/`, `live/`, `embed/`, or a bare 11-character video ID.

See the [root README](../README.md) for the full project, including the web UI and Docker deployment.
