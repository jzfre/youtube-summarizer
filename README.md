# YouTube Video Summarizer

Paste a YouTube link, get an AI-generated summary. A self-hostable web app (plus a standalone CLI) that fetches video transcripts and summarizes them with OpenAI models — no video download, no audio transcription, just the captions YouTube already has.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![Node](https://img.shields.io/badge/node-22+-green.svg)

## Features

- 🤖 **AI-Powered Summaries** — concise, detailed, bullet-point, or key-insight summaries via OpenAI
- 🌍 **Original Language** — prefers the transcript of the video's spoken language over auto-dubbed and translated caption tracks
- ⚡ **Fast & Cheap** — works from the transcript, so there's no video/audio processing
- 🔐 **Shared-Password Gate** — simple login protects your deployment (and your API key) from strangers
- 📝 **Transcript Export** — optionally view or save the full transcript
- 🐳 **Docker Ready** — one `docker compose up` to deploy
- 🖥️ **CLI Included** — the Python core is a standalone CLI you can script with

## Quick Start (Docker)

1. **Clone the repository:**
```bash
git clone https://github.com/jzfre/youtube-summarizer.git
cd youtube-summarizer
```

2. **Create your `.env`:**
```bash
cp .env.example .env
```

3. **Fill in the required values in `.env`:**
```env
OPENAI_API_KEY=sk-your-openai-api-key-here
APP_PASSWORD=pick-a-password          # shared password for the web UI
AUTH_SECRET=paste-a-random-secret-here # run: openssl rand -hex 32
PORT=3000
```

Run `openssl rand -hex 32` in your shell and paste its output into `AUTH_SECRET`; `.env` files do not execute shell commands. Set `OPENAI_MODEL` to a model available to your API account.

4. **Start the application:**
```bash
docker compose up -d
```

5. **Open** `http://localhost:3000`, enter your password, and paste a YouTube link.

For more Docker details, see [README.docker.md](README.docker.md).

## How It Works

```
Browser ──► Next.js web UI ──► API routes ──► Python CLI ──► youtube-transcript-api
   ▲            (auth gate)         │              │
   └────────── summary ◄────────────┴── OpenAI ◄───┘
```

1. **Extract Video ID** — parses any YouTube URL form (`watch`, `youtu.be`, `shorts`, `live`, `embed`) or a bare ID
2. **Fetch Transcript** — `youtube-transcript-api` retrieves the captions
3. **Pick Language** — prefers the caption track of the video's spoken language over auto-dubs and translations (English when YouTube gives no signal)
4. **Summarize** — the transcript goes to an OpenAI model with your chosen summary style
5. **Display** — formatted summary (and optionally the transcript) in the web UI

## Development Setup

### Prerequisites

- Node.js 22+ and npm
- Python 3.11+
- OpenAI API key

### CLI (Python)

```bash
cd cli
python3 -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.lock
cp .env.example .env        # add your OpenAI API key
python youtube_summarizer.py summarize "https://www.youtube.com/watch?v=VIDEO_ID"
```

More CLI options (summary styles, languages, models, output files): see [cli/README.md](cli/README.md).

### Web UI (Next.js)

```bash
cd web-ui
npm ci
cp .env.example .env.local  # fill in the values (see below)
npm run dev
```

`.env.local` needs:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
PYTHON_CLI_PATH=/absolute/path/to/cli/youtube_summarizer.py
PYTHON_EXECUTABLE=/absolute/path/to/cli/venv/bin/python
# APP_PASSWORD / AUTH_SECRET are optional in development
# (defaults: password "dev-password", an insecure dev signing secret)
```

The web UI launches the Python CLI and reads its structured JSON output, so set up the CLI first. Transcript and language-list commands do not need an OpenAI key; generating summaries does.

## Tests and evaluations

From the repository root:

```bash
python3 -m venv cli/.venv
cli/.venv/bin/python -m pip install -r cli/requirements-dev.txt
cli/.venv/bin/python -m pytest cli -q
cli/.venv/bin/python cli/eval_summary.py --offline
cd web-ui
npm ci
npm test
npm run lint
npx tsc --noEmit
npm run build
node scripts/smoke.mjs
```

These checks make no YouTube or OpenAI calls. CI also builds the Docker image and checks unauthenticated access. See [quality and operations](docs/quality.md) for API contracts, live summary evaluations, limits, and deployment checks.

## Authentication

The web UI is gated by a single shared password (`APP_PASSWORD`). Successful login sets an
HMAC-signed, httpOnly session cookie (signed with `AUTH_SECRET`, 2-day expiry). All pages and
API routes are protected by middleware; unauthenticated API calls get a JSON `401`.

- In **production**, `APP_PASSWORD` and `AUTH_SECRET` are required — the compose file refuses
  to start without them, and the app fails closed if they're missing.
- The session cookie is marked `Secure` in production, so **serve the app over HTTPS** —
  behind plain HTTP the browser will drop the cookie and login won't stick.

This is deliberately simple — a gate for sharing with friends, not a multi-user auth system.

## Environment Variables

| Variable            | Where              | Purpose                                              |
| ------------------- | ------------------ | ---------------------------------------------------- |
| `OPENAI_API_KEY`    | all                | OpenAI API key (required for summaries)               |
| `APP_PASSWORD`      | web UI / Docker    | Shared password for the web UI (required in prod)    |
| `AUTH_SECRET`       | web UI / Docker    | Random string signing session cookies (required in prod) |
| `OPENAI_MODEL`      | all                | Model name; defaults to `gpt-5.6-sol`, which must be available through your provider |
| `OPENAI_BASE_URL`   | CLI / Docker       | Optional OpenAI-compatible provider endpoint |
| `PORT`              | Docker             | Host port to expose (default 3000)                   |
| `BIND_ADDRESS`      | Docker             | Host binding (default `127.0.0.1`); set explicitly for LAN access |
| `COOKIE_SECURE`     | web UI / Docker    | Secure cookie by default in production; `false` only for trusted HTTP |
| `TRUST_PROXY`       | web UI / Docker    | Use forwarded client IP for login throttling only behind a trusted proxy |
| `PYTHON_TIMEOUT_MS` | web UI / Docker    | Maximum processing time (default `600000`) |
| `PYTHON_MAX_CONCURRENT` | web UI / Docker | Maximum child processes per server (default `4`) |
| `PYTHON_MAX_OUTPUT_BYTES` | web UI / Docker | Combined child output limit (default `4194304`) |
| `PYTHON_CLI_PATH`   | web UI (dev)       | Absolute path to `cli/youtube_summarizer.py`         |
| `PYTHON_EXECUTABLE` | web UI (dev)       | Python interpreter (e.g. the CLI's venv python)      |

## API Endpoints

All routes require a valid session cookie (login via the web UI):

- `POST /api/summarize` — generate a summary from a video URL/ID
- `POST /api/transcript` — fetch the transcript only
- `POST /api/list-transcripts` — list available transcript languages

## Project Structure

```
youtube-summarizer/
├── cli/                    # Python CLI (the summarization core)
│   ├── youtube_summarizer.py
│   ├── requirements.txt
│   └── .env.example
├── web-ui/                 # Next.js 15 web application
│   ├── src/
│   │   ├── app/            # App Router pages + API routes
│   │   ├── components/     # React components
│   │   ├── lib/            # auth helpers, Python runner
│   │   └── middleware.ts   # session gate
│   └── .env.example
├── Dockerfile              # Multi-stage build (Node + Python)
├── docker-compose.yml
├── LICENSE
└── README.md
```

## Tech Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** + **Tailwind CSS 4**
- **Python 3.11+** with **Click**, **youtube-transcript-api**
- **OpenAI API** for summarization
- **Docker** multi-stage build shipping both runtimes in one image

## Deployment

### Docker (recommended)

See [README.docker.md](README.docker.md).

### Behind Nginx (with TLS)

Serve over HTTPS in production — the session cookie requires it. Example:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # ssl_certificate / ssl_certificate_key via certbot or your CA

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 610s;
        client_max_body_size 16k;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Limitations

- Videos must have captions (manual or auto-generated) — no captions, no summary
- Summary quality depends on caption quality
- OpenAI API rate limits and costs apply
- Transcripts over 350,000 characters are rejected instead of silently shortened. This character limit is not a token counter; smaller transcripts can still exceed a particular model's context window.
- Original-language selection is a metadata heuristic; pass explicit language preferences when needed.
- Shared-password access and process-local throttles target a single-server personal deployment. Multi-replica/public deployments need shared rate limits, durable job control, and suitable identity management.

## Troubleshooting

**"No transcript available"** — the video has no captions; try another video.

**"OpenAI API error"** — check your API key, credits, and rate limits.

**Login doesn't stick in production** — you're probably serving over plain HTTP; the session cookie is `Secure`-only in production. Use HTTPS.

**Docker container won't start** — `docker compose logs`; make sure `.env` sets `OPENAI_API_KEY`, `APP_PASSWORD`, and `AUTH_SECRET`.

**"Python module not found" (dev)** — activate the venv and `pip install -r requirements.lock`; point `PYTHON_EXECUTABLE` at the venv's python.

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) — transcript fetching
- [OpenAI](https://openai.com/) — summarization models
- [Next.js](https://nextjs.org/) — web framework

---

Built with ❤️ using Next.js, Python, and OpenAI

## Deep audit

The [2026-11-17 audit](docs/audit-2026-11-17.md) records ranked findings, fixes, live caption measurements, real HTTP/browser fault tests, and unresolved deployment/model-quality gates. The service is hardened. The earlier YouTube block cleared after the user corrected the VPN connection; real CLI and authenticated HTTP caption checks passed on 2026-11-18. Live summary quality remains unverified without provider credentials.
