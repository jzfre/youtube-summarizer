# YouTube Summarizer — CLI

Python CLI that fetches YouTube transcripts and summarizes them with OpenAI models.
It also powers the [web UI](../web-ui) — the Next.js API routes shell out to this script.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.lock
cp .env.example .env   # add your OpenAI API key
```

## Usage

```bash
# Summarize a video (URL or bare video ID)
python youtube_summarizer.py summarize "https://www.youtube.com/watch?v=VIDEO_ID"

# Pick a summary style: concise | detailed | bullet-points | key-insights
python youtube_summarizer.py summarize VIDEO_ID --type key-insights

# Prefer specific transcript languages (default: the video's original language)
python youtube_summarizer.py summarize VIDEO_ID -l en -l de

# Use a different model, save to a file, include the transcript
python youtube_summarizer.py summarize VIDEO_ID -m gpt-4o -o summary.txt --show-transcript

# List available transcript languages
python youtube_summarizer.py list-transcripts VIDEO_ID

# Fetch the raw transcript only (no OpenAI call)
python youtube_summarizer.py transcript VIDEO_ID -o transcript.txt
```

For scripts, add `--json` to any command. Summaries emit `video_id`, `transcript_length`, and `summary` (plus `transcript` with `--show-transcript`); transcript output emits `video_id` and `transcript`; lists emit `video_id` and `transcripts`. Progress stays on stderr and failures exit nonzero. Use `--` before bare IDs that start with `-`.

Transcript-only and language-list commands work without an OpenAI API key. Summarization uses `OPENAI_MODEL` or the existing `gpt-5.6-sol` default; select a model your provider supports using `-m` or the environment variable. `OPENAI_BASE_URL` can point to an OpenAI-compatible provider. Transcripts over 350,000 characters are rejected; they are never silently truncated.

Supported URL forms: `watch?v=`, `youtu.be/`, `shorts/`, `live/`, `embed/`, or a bare 11-character video ID.

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest -q
python eval_summary.py --offline
```

Offline evaluations validate fixtures and grading behavior without calling a model. For billable model quality checks use `python eval_summary.py --live`; see [quality and operations](../docs/quality.md) for interpretation and limitations.

See the [root README](../README.md) for the full project, including the web UI and Docker deployment.
