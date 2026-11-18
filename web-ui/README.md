# YouTube Summarizer — Web UI

Next.js 15 (App Router) frontend for the [YouTube Summarizer](../README.md). It provides
a password-gated web interface that calls the Python CLI in [`../cli`](../cli) to fetch
transcripts and generate AI summaries.

## Development

```bash
npm ci
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable            | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `OPENAI_API_KEY`    | OpenAI API key used for summaries                                     |
| `PYTHON_CLI_PATH`   | Absolute path to `cli/youtube_summarizer.py`                          |
| `PYTHON_EXECUTABLE` | Python interpreter to use (e.g. the CLI's venv python)                |
| `APP_PASSWORD`      | Shared password gating the UI (required in production)                |
| `AUTH_SECRET`       | Random string used to sign session cookies (required in production)   |

## Validation

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
node scripts/smoke.mjs
```

Tests use local fake child processes and mocked upstreams, so no API key or network access is needed. API requests are limited to 16 KiB. Processing has bounded time, output, and concurrency; see [quality and operations](../docs/quality.md) for limits, error statuses, and reverse-proxy configuration.

`OPENAI_MODEL` selects the server default, `OPENAI_BASE_URL` selects an optional provider endpoint, and `PYTHON_TIMEOUT_MS`, `PYTHON_MAX_OUTPUT_BYTES`, and `PYTHON_MAX_CONCURRENT` control subprocess limits. `TRUST_PROXY=true` is only appropriate when a trusted proxy overwrites `X-Forwarded-For` and direct access is blocked.

## Structure

- `src/app` — App Router pages and API routes (`/api/summarize`, `/api/transcript`, `/api/list-transcripts`, `/api/auth/*`)
- `src/components` — form, result display, and loading UI
- `src/lib` — auth/session helpers and the Python process runner
- `src/middleware.ts` — session check that gates every page and API route

See the [root README](../README.md) for the full picture, including Docker deployment.
