# YouTube Summarizer — Web UI

Next.js 15 (App Router) frontend for the [YouTube Summarizer](../README.md). It provides
a password-gated web interface that calls the Python CLI in [`../cli`](../cli) to fetch
transcripts and generate AI summaries.

## Development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable            | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `OPENAI_API_KEY`    | OpenAI API key used for summaries and language detection              |
| `PYTHON_CLI_PATH`   | Absolute path to `cli/youtube_summarizer.py`                          |
| `PYTHON_EXECUTABLE` | Python interpreter to use (e.g. the CLI's venv python)                |
| `APP_PASSWORD`      | Shared password gating the UI (required in production)                |
| `AUTH_SECRET`       | Random string used to sign session cookies (required in production)   |

## Structure

- `src/app` — App Router pages and API routes (`/api/summarize`, `/api/transcript`, `/api/list-transcripts`, `/api/auth/*`)
- `src/components` — form, result display, and loading UI
- `src/lib` — auth/session helpers and the Python process runner
- `src/middleware.ts` — session check that gates every page and API route

See the [root README](../README.md) for the full picture, including Docker deployment.
