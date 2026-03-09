#!/bin/bash
set -e

echo "================================================"
echo "  Maximo Data Extractor - Starting..."
echo "================================================"

# Setup venv if not exists
if [ ! -d "venv" ]; then
    echo "[INFO] Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install backend dependencies
echo "[INFO] Installing backend dependencies..."
pip install -q -r backend/requirements.txt

# Build frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
    echo "[INFO] Building frontend..."
    cd frontend
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    npm run build
    cd ..
fi

# Create data directory
mkdir -p data/exports

echo ""
echo "================================================"
echo "  Starting server at http://localhost:8000"
echo "  Press Ctrl+C to stop"
echo "================================================"
echo ""

cd backend
python run.py
