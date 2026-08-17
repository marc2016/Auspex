#!/usr/bin/env bash

# ==============================================================================
# Auspex Startup Script
# Fixed, collision-free ports:
#   - Backend API + WebSockets: http://localhost:4890
#   - Frontend Web App UI:      http://localhost:4891
# ==============================================================================

set -e

BACKEND_PORT=4890
FRONTEND_PORT=4891

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "🔭 =========================================="
echo "   Starting Project Auspex"
echo "   Behavioral Code Analysis Platform"
echo "=========================================="
echo ""

# 1. Clean up any existing processes on Auspex ports
echo "🔍 Checking ports $BACKEND_PORT and $FRONTEND_PORT..."
PIDS=$(lsof -ti :$BACKEND_PORT :$FRONTEND_PORT 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "⚠️  Cleaning up previous process(es) on port(s). Stopping PIDs: $PIDS"
  kill -9 $PIDS 2>/dev/null || true
  sleep 1
fi

# 2. Ensure dependencies exist
if [ ! -d "node_modules" ] || [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
  echo "📦 Installing workspace dependencies..."
  npm install
fi

# 3. Build shared types
echo "🛠️  Building shared package..."
npm run build --workspace=shared

echo ""
echo "🚀 Backend starting on http://localhost:$BACKEND_PORT"
echo "🌐 Frontend starting on http://localhost:$FRONTEND_PORT"
echo ""
echo "👉 Open your browser: http://localhost:$FRONTEND_PORT"
echo ""

# Trap exit signals to gracefully terminate all child processes
trap 'echo ""; echo "🛑 Stopping Auspex servers..."; kill 0 2>/dev/null || true; exit 0' SIGINT SIGTERM EXIT

# Start backend and frontend concurrently
(cd backend && PORT=$BACKEND_PORT npx tsx src/server.ts) &
(cd frontend && PORT=$FRONTEND_PORT VITE_BACKEND_PORT=$BACKEND_PORT npm run dev) &

# Wait for background jobs
wait
