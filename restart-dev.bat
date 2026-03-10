@echo off
taskkill /F /FI "IMAGENAME eq node.exe" >nul 2>&1
timeout /t 1 /nobreak >nul
cd /d %~dp0
npm run dev
