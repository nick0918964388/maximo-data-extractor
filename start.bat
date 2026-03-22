@echo off
setlocal enabledelayedexpansion
title Maximo Data Extractor

echo ================================================
echo   Maximo Data Extractor - Starting...
echo ================================================

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.11+
    pause
    exit /b 1
)

:: Setup venv if not exists
if not exist "venv" (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create venv
        pause
        exit /b 1
    )
)

:: Activate venv and install dependencies
echo [INFO] Installing backend dependencies...
call venv\Scripts\activate.bat
pip install -q -r backend\requirements.txt

:: Build frontend if dist doesn't exist
if not exist "frontend\dist" (
    echo [INFO] Building frontend...
    cd frontend

    :: Check if node_modules exists
    if not exist "node_modules" (
        echo [INFO] Installing frontend dependencies...
        npm install
    )

    npm run build
    cd ..
)

:: Create data directory
if not exist "data\exports" mkdir data\exports

:: Start backend
echo.
echo ================================================
echo   Starting server at http://localhost:8000
echo   Press Ctrl+C to stop
echo ================================================
echo.

cd backend
python run.py

pause
