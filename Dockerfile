# Multi-stage Dockerfile for YouTube Video Generator Monorepo

# Stage 1: Build Backend with Node 20
FROM node:20-alpine AS backend-builder

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

# Stage 2: Build Frontend with Node 20 (Next.js 16 compatible)
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/

# Copy shared source
COPY packages/shared ./packages/shared

# Install frontend dependencies
WORKDIR /app/packages/frontend
RUN npm install

# Copy frontend source and build with standalone output
COPY packages/frontend ./
RUN npm run build

# Stage 3: Production Runtime with Node 20
FROM node:20-alpine AS runtime

# Install FFmpeg and runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    ffmpeg-libs \
    ca-certificates \
    dumb-init

WORKDIR /app

# Copy built backend with node_modules
COPY --from=backend-builder /app/packages/backend ./packages/backend
COPY --from=backend-builder /app/packages/shared ./packages/shared

# Copy built frontend
COPY --from=frontend-builder /app/packages/frontend/.next ./packages/frontend/.next
COPY --from=frontend-builder /app/packages/frontend/public ./packages/frontend/public
COPY --from=frontend-builder /app/packages/frontend/package.json ./packages/frontend/
COPY --from=frontend-builder /app/packages/frontend/node_modules ./packages/frontend/node_modules

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
CMD ["/bin/sh", "/app/start.sh"]
