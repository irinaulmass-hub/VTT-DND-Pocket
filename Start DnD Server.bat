@echo off
title D&D Control Console
cd /d "%~dp0"
echo Starting D&D Control Console...
echo.
echo   DM Panel    : http://localhost:3000
echo   Player View : http://localhost:3000/player
echo   Remote      : http://localhost:3000/remote
echo.
echo Close this window to stop the server.
echo ----------------------------------------
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
node server.js
pause