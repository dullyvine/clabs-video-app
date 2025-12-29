# Multi-stage Dockerfile for YouTube Video Generator Monorepo
# Stage 1: Build Stage - Using Node.js 18 for ffi-napi/vosk compatibility
FROM node:18-alpine AS builder

# Install system dependencies including FFmpeg
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    ffmpeg

WORKDIR /app

# Copy package files for dependency installation
COPY package.json ./
COPY package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Build shared types first
WORKDIR /app/packages/shared
RUN npm run build || true

# Build backend
WORKDIR /app/packages/backend
RUN npm run build

# Build frontend (Next.js)
WORKDIR /app/packages/frontend
RUN npm run build

# Stage 2: Production Runtime
FROM node:18-alpine AS runtime

# Install FFmpeg and other runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    ffmpeg-libs \
    ca-certificates \
    dumb-init

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules

# Create necessary directories
RUN mkdir -p packages/backend/temp && \
    mkdir -p packages/backend/uploads && \
    mkdir -p packages/backend/public/temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV FRONTEND_PORT=3000

# Expose ports
EXPOSE 3000 3001

# Create startup script
COPY <<'EOF' /app/start.sh
#!/bin/sh
set -e

echo "Starting YouTube Video Generator..."

# Start backend
cd /app/packages/backend
npm run start &
BACKEND_PID=$!

# Start frontend
cd /app/packages/frontend
npm run start &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID
wait $FRONTEND_PID
EOF

RUN chmod +x /app/start.sh

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/bin/sh", "/app/start.sh"]
