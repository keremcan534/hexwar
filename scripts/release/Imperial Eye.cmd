@echo off
rem Imperial Eye: cift tikla, oyun tam ekran acilir. Ayrinti: oyun\scripts\release\play.ps1
rem Zip'in icinden calistirilinca oyun dosyalari yanda olmaz; once klasore cikarilmali.
if exist "%~dp0oyun\index.html" goto oyna
echo.
echo   Oyun dosyalari bulunamadi.
echo   Once zip dosyasina sag tiklayip "Tumunu ayikla" deyin,
echo   sonra cikan klasordeki "Imperial Eye" dosyasina cift tiklayin.
echo.
pause
exit /b 1
:oyna
start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0oyun\scripts\release\play.ps1"
