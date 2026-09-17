@echo off
rem Imperial Eye'i tam ekran baslatir: cift tikla. Ayrinti: scripts\launch.ps1
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\launch.ps1"
