param(
  [int]$StartPort = 5173,
  [int]$MaxAttempts = 40,
  [switch]$NoInstall,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDirectory
Set-Location $ProjectRoot

function Test-PortOpen {
  param([int]$Port)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $wait = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $opened = $wait.AsyncWaitHandle.WaitOne(250, $false)
    if (-not $opened) {
      return $false
    }
    $client.EndConnect($wait) | Out-Null
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Test-StudyDesk {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500 -and $response.Content -match "软微 420"
  } catch {
    return $false
  }
}

function Find-FreePort {
  param([int]$From, [int]$Attempts)
  for ($index = 0; $index -lt $Attempts; $index += 1) {
    $port = $From + $index
    if (-not (Test-PortOpen -Port $port)) {
      return $port
    }
  }
  throw "No free port found from $From to $($From + $Attempts - 1)."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is not available. Install Node.js 22, then run this script again."
}

$existingUrl = "http://127.0.0.1:$StartPort/"
if (Test-StudyDesk -Url $existingUrl) {
  Write-Host "Already running: $existingUrl" -ForegroundColor Green
  if (-not $NoOpen) {
    Start-Process $existingUrl
  }
  exit 0
}

if (-not $NoInstall -and -not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  Write-Host "node_modules not found. Running npm install..." -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed."
  }
}

$port = Find-FreePort -From $StartPort -Attempts $MaxAttempts
$url = "http://127.0.0.1:$port/"
$title = "软微 420 学习台  $url"
$command = "cd /d `"$ProjectRoot`" && title $title && npm run dev -- --port $port --strictPort"

Write-Host "Starting Vite on $url" -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $command -WorkingDirectory $ProjectRoot -WindowStyle Normal | Out-Null

$ready = $false
for ($index = 0; $index -lt 60; $index += 1) {
  Start-Sleep -Milliseconds 500
  if (Test-StudyDesk -Url $url) {
    $ready = $true
    break
  }
}

if (-not $ready) {
  Write-Warning "Vite was started, but $url did not respond within 30 seconds. Check the opened terminal window."
  exit 1
}

if (-not $NoOpen) {
  Start-Process $url
}

Write-Host "Ready: $url" -ForegroundColor Green
