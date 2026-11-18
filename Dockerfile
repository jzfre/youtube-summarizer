# Build and runtime use the same Node/glibc environment for native modules.
FROM node:22-bookworm-slim AS builder
WORKDIR /app/web-ui
ENV NEXT_TELEMETRY_DISABLED=1
COPY web-ui/package*.json ./
RUN npm ci
COPY web-ui/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv
COPY cli/requirements.lock /tmp/requirements.lock
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.lock \
    && rm /tmp/requirements.lock
COPY --chown=node:node cli/youtube_summarizer.py /app/cli/youtube_summarizer.py

WORKDIR /app/web-ui
COPY web-ui/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=node:node /app/web-ui/.next ./.next
COPY --from=builder --chown=node:node /app/web-ui/public ./public
COPY --from=builder /app/web-ui/next.config.js ./next.config.js

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PYTHON_EXECUTABLE=/opt/venv/bin/python \
    PYTHON_CLI_PATH=/app/cli/youtube_summarizer.py \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
# Forward shutdown signals to Node and its Python children, and reap children.
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
