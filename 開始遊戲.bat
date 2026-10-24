@echo off
rem Serves this folder on http://127.0.0.1:8765 and opens the game there.
rem Double-clicking index.html opens it as file://, where the browser blocks the file loads the Apex maps need.
cd /d "%~dp0"
where python >nul 2>nul || goto nopython
start "SF2 local server (close to stop)" /min python -m http.server 8765 --bind 127.0.0.1
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8765/index.html"
goto :eof
:nopython
echo Python 3 is required: https://www.python.org/downloads/
pause
