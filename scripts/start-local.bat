@echo off
setlocal
cd /d "%~dp0.."
where pwsh >nul 2>&1
if %errorlevel%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
)
if errorlevel 1 (
  echo.
  echo Local preview did not start. Read the message above.
  pause
)
endlocal
