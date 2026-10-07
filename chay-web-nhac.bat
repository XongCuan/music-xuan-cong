@echo off
title Music Xuan Cong - Server & Cloudflare Live
cd /d "%~dp0"
echo =========================================================
echo       DANG KHOI DONG MUSIC XUAN CONG (GOLIVE)
echo =========================================================
start http://localhost:3300
start /B .\cloudflared.exe tunnel --url http://localhost:3300
node server.js
pause
