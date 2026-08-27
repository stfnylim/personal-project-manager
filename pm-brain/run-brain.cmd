@echo off
title PM Brain
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-brain.ps1"
echo.
pause
