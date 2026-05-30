param(
  [int]$StartPort = 5173,
  [int]$MaxAttempts = 40,
  [switch]$NoInstall,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

function Test-PortInUse {
  param([int]$Port)
  $connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$connection
}

function Find-FreePort {
  param([int]$From, [int]$Attempts)
  for ($index = 0; $index -lt $Attempts; $index += 1) {
    $port = $From + $index
    if (-not (Test-PortInUse -Port $port)) {
      return $port
    }
  }
  throw "No free port found from $From to $($From + $Attempts - 1)."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is not available. Install Node.js first, then run this script again."
}

if (-not $NoInstall -and -not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  Write-Host "node_modules not found. Running npm install..." -ForegroundColor Cyan
  npm install
}

$port = Find-FreePort -From $StartPort -Attempts $MaxAttempts
$url = "http://127.0.0.1:$port/"
$title = "PKU SWM 420 Study System - Vite $port"
$command = "cd /d `"$ProjectRoot`" && npm run dev -- --port $port --strictPort"

Write-Host "Starting Vite on $url" -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title $title && $command" -WorkingDirectory $ProjectRoot -WindowStyle Normal | Out-Null

$ready = $false
for ($index = 0; $index -lt 60; $index += 1) {
  Start-Sleep -Milliseconds 500
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    # Vite is still starting.
  }
}

if (-not $ready) {
  Write-Warning "Vite was started, but the page did not respond within 30 seconds. Check the opened terminal window."
  exit 1
}

if (-not $NoOpen) {
  Start-Process $url
}

Write-Host "Ready: $url" -ForegroundColor Green
