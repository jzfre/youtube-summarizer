# YouTube Video Summarizer

Paste a YouTube link, get an AI-generated summary. A self-hostable web app (plus a standalone CLI) that fetches video transcripts and summarizes them with OpenAI models — no video download, no audio transcription, just the captions YouTube already has.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![Node](https://img.shields.io/badge/node-20+-green.svg)

## Features

- 🤖 **AI-Powered Summaries** — concise, detailed, bullet-point, or key-insight summaries via OpenAI
- 🌍 **Auto Language Detection** — detects the transcript's language and picks the best available track
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
AUTH_SECRET=$(openssl rand -hex 32)   # signs session cookies
PORT=3000
```

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
3. **Detect Language** — lists available transcript tracks and picks the video's own language when possible
4. **Summarize** — the transcript goes to an OpenAI model with your chosen summary style
5. **Display** — formatted summary (and optionally the transcript) in the web UI

## Development Setup

### Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- OpenAI API key

### CLI (Python)

```bash
cd cli
python3 -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # add your OpenAI API key
python youtube_summarizer.py summarize "https://www.youtube.com/watch?v=VIDEO_ID"
```

More CLI options (summary styles, languages, models, output files): see [cli/README.md](cli/README.md).

### Web UI (Next.js)

```bash
cd web-ui
npm install
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

The web UI shells out to the Python CLI, so set up the CLI first.

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
| `OPENAI_API_KEY`    | all                | OpenAI API key (required)                            |
| `APP_PASSWORD`      | web UI / Docker    | Shared password for the web UI (required in prod)    |
| `AUTH_SECRET`       | web UI / Docker    | Random string signing session cookies (required in prod) |
| `PORT`              | Docker             | Host port to expose (default 3000)                   |
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
- **OpenAI API** for summarization and language detection
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
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Limitations

- Videos must have captions (manual or auto-generated) — no captions, no summary
- Summary quality depends on caption quality
- OpenAI API rate limits and costs apply
- Very long transcripts may exceed the model's context window

## Troubleshooting

**"No transcript available"** — the video has no captions; try another video.

**"OpenAI API error"** — check your API key, credits, and rate limits.

**Login doesn't stick in production** — you're probably serving over plain HTTP; the session cookie is `Secure`-only in production. Use HTTPS.

**Docker container won't start** — `docker compose logs`; make sure `.env` sets `OPENAI_API_KEY`, `APP_PASSWORD`, and `AUTH_SECRET`.

**"Python module not found" (dev)** — activate the venv and `pip install -r requirements.txt`; point `PYTHON_EXECUTABLE` at the venv's python.

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
