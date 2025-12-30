# Multi-stage Dockerfile for YouTube Video Generator Monorepo

# Stage 1: Build Backend with Node 20 (using slim/Debian for glibc compatibility with onnxruntime)
FROM node:20-slim AS backend-builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# Copy shared source for building
COPY packages/shared ./packages/shared

# Install backend dependencies
WORKDIR /app/packages/backend
RUN npm install

# Copy backend source and build
COPY packages/backend ./
RUN npm run build

# Stage 2: Build Frontend with Node 20
FROM node:20-slim AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/

# Copy shared source
COPY packages/shared ./packages/shared

# Copy frontend source
COPY packages/frontend ./packages/frontend

# Install dependencies from root (handles workspace hoisting properly)
RUN npm install

# Set backend URL for Next.js rewrites (used at runtime)
ENV BACKEND_URL=http://localhost:3001

# Build frontend
WORKDIR /app/packages/frontend
RUN npm run build

# Stage 3: Production Runtime with Node 20 (Debian-based for glibc)
FROM node:20-slim AS runtime

# Install FFmpeg and runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built backend with node_modules
COPY --from=backend-builder /app/packages/backend ./packages/backend
COPY --from=backend-builder /app/packages/shared ./packages/shared

# Copy built frontend
COPY --from=frontend-builder /app/packages/frontend/.next ./packages/frontend/.next
COPY --from=frontend-builder /app/packages/frontend/public ./packages/frontend/public
COPY --from=frontend-builder /app/packages/frontend/package.json ./packages/frontend/
# Copy node_modules from root (npm workspaces hoists dependencies)
COPY --from=frontend-builder /app/node_modules ./packages/frontend/node_modules

# Create necessary directories
RUN mkdir -p packages/backend/temp && \
    mkdir -p packages/backend/uploads && \
    mkdir -p packages/backend/public/temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV FRONTEND_PORT=3000
ENV BACKEND_URL=http://localhost:3001

# Expose ports
EXPOSE 3000 3001

# Create startup script
COPY <<'EOF' /app/start.sh
#!/bin/bash
set -e

echo "Starting YouTube Video Generator..."
echo "Node version: $(node --version)"

# Start backend on port 3001
cd /app/packages/backend
echo "Starting backend..."
node dist/server.js &
BACKEND_PID=$!

# Give backend time to start
sleep 2

# Start frontend on port 3000
cd /app/packages/frontend
echo "Starting frontend..."
npx next start -p 3000 &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
EOF

RUN chmod +x /app/start.sh

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/bin/bash", "/app/start.sh"]
