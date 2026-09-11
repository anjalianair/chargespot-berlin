@echo off
setlocal
title ChargeSpot Berlin Setup

cd /d "%~dp0"

echo.
echo ==========================================
echo        ChargeSpot Berlin Setup
echo ==========================================
echo.

docker version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker Desktop is not running.
    echo Start Docker Desktop, wait until it is ready, and run this file again.
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    if exist ".env.example" (
        echo Creating .env from .env.example...
        copy /Y ".env.example" ".env" >nul
    ) else (
        echo ERROR: Neither .env nor .env.example was found.
        echo.
        pause
        exit /b 1
    )
)

echo Building and starting the application...
docker compose up -d --build

if errorlevel 1 (
    echo.
    echo ERROR: Docker Compose could not start the application.
    echo Run docker compose logs to inspect the problem.
    echo.
    pause
    exit /b 1
)

echo.
echo Waiting for the API to become ready...

set /a ATTEMPT=0

:WAIT_FOR_API
set /a ATTEMPT+=1

powershell.exe -NoProfile -Command ^
  "try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 3; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"

if not errorlevel 1 goto READY

if %ATTEMPT% GEQ 30 goto NOT_READY

timeout /t 2 /nobreak >nul
goto WAIT_FOR_API

:READY
echo.
echo ChargeSpot Berlin is ready.
echo.
echo Web application: http://127.0.0.1:5173
echo API documentation: http://127.0.0.1:8000/docs
echo Feature service: http://127.0.0.1:9000
echo.

start "" "http://127.0.0.1:5173"

pause
exit /b 0

:NOT_READY
echo.
echo WARNING: The containers started, but the API did not become ready.
echo.
echo Inspect their status with:
echo docker compose ps -a
echo.
echo Inspect the API logs with:
echo docker compose logs api --tail 100
echo.
pause
exit /b 1
