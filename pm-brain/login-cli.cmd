@echo off
title Claude CLI login (one-time)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0login-cli.ps1"
pause
