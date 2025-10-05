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

2. **Edit the `.env` file** and add your OpenAI API key:

```env
OPENAI_API_KEY=sk-your-actual-api-key-here
PORT=3000
```

3. **Build and run the container**:

```bash
docker-compose up -d
```

The service will be available at `http://localhost:3000`

## Commands

### Start the service
```bash
docker-compose up -d
```

### Stop the service
```bash
docker-compose down
```

### View logs
```bash
docker-compose logs -f
```

### Rebuild after code changes
```bash
docker-compose up -d --build
```

### Check service status
```bash
docker-compose ps
```

## Custom Port

To run on a different port, change the `PORT` variable in your `.env` file:

```env
PORT=8080
```

Then restart the container:

```bash
docker-compose down
docker-compose up -d
```

## Using with Nginx

Here's an example Nginx configuration to proxy to your Docker container:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Troubleshooting

### Container won't start
Check logs:
```bash
docker-compose logs
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
docker-compose ps
```

Look for `healthy` status.
