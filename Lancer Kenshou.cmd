@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 ou superieur doit etre installe.
  pause
  exit /b 1
)
node scripts/launch.mjs
pause
