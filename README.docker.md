# Docker Setup for YouTube Summarizer

This guide will help you run the YouTube Summarizer application using Docker.

## Prerequisites

- Docker installed on your system
- Docker Compose installed
- OpenAI API key

## Quick Start

1. **Create a `.env` file** in the project root:

```bash
cp .env.example .env
```

2. **Edit the `.env` file** and set the required values:

```env
OPENAI_API_KEY=sk-your-actual-api-key-here
APP_PASSWORD=pick-a-password          # shared password for the web UI
AUTH_SECRET=generate-with-openssl     # openssl rand -hex 32
PORT=3000
BIND_ADDRESS=127.0.0.1
```

Run `openssl rand -hex 32` in the shell and paste its output into `AUTH_SECRET`; `.env` does not execute shell substitutions. Set `OPENAI_MODEL` to a model your OpenAI account or compatible provider supports; `OPENAI_BASE_URL` is optional.

`docker compose up` refuses to start unless all three are set. `APP_PASSWORD`
gates the web UI; `AUTH_SECRET` signs the session cookie — keep both private.

3. **Build and run the container**:

```bash
docker compose up -d
```

The image runs Node 22 and Python 3.11 as the unprivileged `node` user. Python dependencies come from `cli/requirements.lock`. An init process forwards shutdown signals and reaps child processes.

The service will be available at `http://localhost:3000`. Open it, enter your
password, and paste a YouTube link.

> **Serve over HTTPS in production.** The session cookie is marked `Secure` when
> `NODE_ENV=production` (the default in the image), so browsers drop it over
> plain HTTP on any non-localhost host and login won't stick. Put the container
> behind an HTTPS reverse proxy (see below), or set `COOKIE_SECURE=false` in
> `.env` only for trusted plain-HTTP LAN use.

## Commands

### Start the service
```bash
docker compose up -d
```

### Stop the service
```bash
docker compose down
```

### View logs
```bash
docker compose logs -f
```

### Rebuild after code changes
```bash
docker compose up -d --build
```

### Check service status
```bash
docker compose ps
```

## Custom Port

To run on a different port, change the `PORT` variable in your `.env` file:

```env
PORT=8080
```

Then restart the container:

```bash
docker compose down
docker compose up -d
```

The published port binds to `127.0.0.1` by default. A proxy on the same host can reach it, but other machines cannot connect directly. For intentional LAN exposure set `BIND_ADDRESS=0.0.0.0` and configure appropriate host firewall rules.

## Using with Nginx (HTTPS)

Terminate TLS at the proxy so the `Secure` session cookie is honored:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

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

The default processing deadline is 600 seconds; keep the proxy timeout above it. Set `TRUST_PROXY=true` only if the proxy overwrites `X-Forwarded-For` as above and clients cannot reach the app directly. Otherwise login throttling intentionally uses one shared bucket. For a chain of proxies, configure trusted client-IP resolution at the ingress before enabling this.

## Troubleshooting

### Container won't start
Check logs:
```bash
docker compose logs
```

### Port already in use
Change the port in `.env` file or stop the service using that port.

### API key not working
Make sure your `.env` file has the correct OpenAI API key without quotes:
```env
OPENAI_API_KEY=sk-your-key-here
```

## Health Check

The container includes a health check that runs every 30 seconds. You can check the health status:

```bash
docker compose ps
```

Look for `healthy` status. The probe requests `/login`, so it does not spend API credit or validate YouTube/OpenAI connectivity. Docker health status alone does not restart an unhealthy process; `restart: unless-stopped` restarts an exited container.

For a release, also verify login and logout, unauthenticated `/api/summarize` returning 401, and one representative transcript plus summary if API spending is intended. See [quality and operations](docs/quality.md) for limits and live evaluation instructions.
