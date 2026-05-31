$ErrorActionPreference = "Stop"

function Get-ProjectRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "OK  $Message" -ForegroundColor Green
}

function Write-WarnLine {
  param([string]$Message)
  Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Fail {
  param([string]$Message)
  throw $Message
}

function Import-DotEnv {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Optional
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    if ($Optional) {
      return
    }
    Fail "Missing config file: $Path. Copy .env.deploy.example to .env.deploy and fill it first."
  }

  $lineNo = 0
  foreach ($line in Get-Content -LiteralPath $Path) {
    $lineNo += 1
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    if ($trimmed -notmatch "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$") {
      Fail "Invalid dotenv line $lineNo in $Path"
    }
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Get-EnvValue {
  param([Parameter(Mandatory = $true)][string]$Name)
  return [Environment]::GetEnvironmentVariable($Name, "Process")
}

function Require-Env {
  param([Parameter(Mandatory = $true)][string[]]$Names)
  $missing = @()
  foreach ($name in $Names) {
    $value = Get-EnvValue $name
    if ([string]::IsNullOrWhiteSpace($value) -or $value -like "your-*") {
      $missing += $name
    }
  }
  if ($missing.Count -gt 0) {
    Fail "Missing required deploy config: $($missing -join ', ')"
  }
}

function Test-EnvPresent {
  param([Parameter(Mandatory = $true)][string[]]$Names)
  foreach ($name in $Names) {
    $value = Get-EnvValue $name
    if ([string]::IsNullOrWhiteSpace($value) -or $value -like "your-*") {
      return $false
    }
  }
  return $true
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$WorkingDirectory = (Get-Location).Path,
    [switch]$AllowFailure,
    [switch]$PassThruOutput
  )

  $redactedArgs = @()
  $redactNext = $false
  foreach ($arg in $ArgumentList) {
    if ($redactNext) {
      $redactedArgs += "***"
      $redactNext = $false
      continue
    }
    if ($arg -in @("--token", "--password", "-p", "--db-password", "--value")) {
      $redactedArgs += $arg
      $redactNext = $true
      continue
    }
    if ($arg -match "^(GITHUB_TOKEN|VERCEL_TOKEN|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VITE_SUPABASE_PUBLISHABLE_KEY)=") {
      $redactedArgs += ($arg -replace "=.*$", "=***")
      continue
    }
    if ($arg -match "(?i)Bearer\s+[A-Za-z0-9_\-\.]+") {
      $redactedArgs += ($arg -replace "(?i)Bearer\s+[A-Za-z0-9_\-\.]+", "Bearer ***")
      continue
    }
    $redactedArgs += $arg
  }
  $display = "$FilePath $($redactedArgs -join ' ')".Trim()
  Write-Host $display -ForegroundColor DarkGray

  Push-Location $WorkingDirectory
  $oldErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = & $FilePath @ArgumentList 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $oldErrorActionPreference
    Pop-Location
  }
  if ($PassThruOutput) {
    $output | ForEach-Object { Write-Host $_ }
  }
  if ($exitCode -ne 0 -and -not $AllowFailure) {
    $text = ($output | Out-String).Trim()
    if ($text) {
      Write-Host $text -ForegroundColor Red
    }
    Fail "Command failed with exit code ${exitCode}: $display"
  }
  return @{
    ExitCode = $exitCode
    Output = ($output | Out-String)
  }
}

function Invoke-Npx {
  param(
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [switch]$AllowFailure,
    [switch]$PassThruOutput
  )
  return Invoke-Checked -FilePath "npx" -ArgumentList $ArgumentList -AllowFailure:$AllowFailure -PassThruOutput:$PassThruOutput
}

function Ensure-Command {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$InstallHint = ""
  )
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    if ($InstallHint) {
      Fail "$Name is not available. $InstallHint"
    }
    Fail "$Name is not available."
  }
  Write-Ok "$Name available"
}

function Write-LocalEnvFile {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][string]$SupabaseUrl,
    [Parameter(Mandatory = $true)][string]$SupabaseKey
  )

  $envPath = Join-Path $ProjectRoot ".env"
  $content = @(
    "VITE_SUPABASE_URL=$SupabaseUrl",
    "VITE_SUPABASE_PUBLISHABLE_KEY=$SupabaseKey"
  ) -join [Environment]::NewLine
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($envPath, $content, $utf8NoBom)
  Write-Ok ".env updated for local Vite"
}

function Assert-SecretFilesIgnored {
  param([Parameter(Mandatory = $true)][string]$ProjectRoot)
  $status = (& git -C $ProjectRoot status --short -- .env .env.deploy 2>$null | Out-String).Trim()
  if ($status) {
    Fail "Secret file appears in git status. Check .gitignore before deploying:`n$status"
  }
}

function Read-JsonOrNull {
  param([string]$Text)
  try {
    return $Text | ConvertFrom-Json
  } catch {
    return $null
  }
}
