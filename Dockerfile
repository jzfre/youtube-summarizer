# Multi-stage Dockerfile for YouTube Summarizer
FROM node:20-alpine AS base

# Install Python and dependencies
RUN apk add --no-cache python3 py3-pip

# Stage 1: Build the Next.js app
FROM base AS builder
WORKDIR /app

# Copy web-ui package files
COPY web-ui/package*.json ./web-ui/
WORKDIR /app/web-ui
RUN npm ci

# Copy web-ui source
COPY web-ui/ .
RUN npm run build

# Stage 2: Setup Python CLI
FROM base AS python-setup
WORKDIR /app/cli

# Copy CLI requirements and install
COPY cli/requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Copy CLI source
COPY cli/ .

# Stage 3: Production image
FROM base AS runner
WORKDIR /app

# Install production dependencies only
RUN apk add --no-cache python3 py3-pip

# Copy Python CLI and dependencies
COPY --from=python-setup /usr/lib/python3.11/site-packages /usr/lib/python3.11/site-packages
COPY --from=python-setup /app/cli /app/cli

# Copy Next.js build
COPY --from=builder /app/web-ui/.next /app/web-ui/.next
COPY --from=builder /app/web-ui/public /app/web-ui/public
COPY --from=builder /app/web-ui/package*.json /app/web-ui/
COPY --from=builder /app/web-ui/next.config.ts /app/web-ui/next.config.ts

# Install production Node modules
WORKDIR /app/web-ui
RUN npm ci --omit=dev

# Set environment variables
ENV NODE_ENV=production
ENV PYTHON_EXECUTABLE=/usr/bin/python3
ENV PYTHON_CLI_PATH=/app/cli/youtube_summarizer.py
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
