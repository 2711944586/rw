param(
  [string]$ConfigPath = ".env.deploy",
  [switch]$Production,
  [switch]$SkipQuality,
  [switch]$SkipGit,
  [switch]$SkipSupabase,
  [switch]$SkipVercelEnv,
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/deploy-lib.ps1"

try {

$ProjectRoot = Get-ProjectRoot
Set-Location $ProjectRoot
$ConfigFullPath = if ([System.IO.Path]::IsPathRooted($ConfigPath)) {
  $ConfigPath
} else {
  Join-Path $ProjectRoot $ConfigPath
}

Write-Step "Loading deploy config"
Import-DotEnv -Path (Join-Path $ProjectRoot ".env") -Optional
Import-DotEnv -Path $ConfigFullPath

$deployTarget = if ($Production) { "production" } else { "preview" }
$deployFlag = if ($Production) { @("--prod") } else { @() }

Write-Step "Checking local tools"
Ensure-Command "node" "Install Node.js LTS first."
Ensure-Command "npm" "Install Node.js LTS first."
Ensure-Command "git" "Install Git first."
Assert-SecretFilesIgnored -ProjectRoot $ProjectRoot

if (-not $SkipQuality) {
  Write-Step "Installing dependencies and running quality gate"
  Invoke-Checked -FilePath "npm" -ArgumentList @("install") -PassThruOutput
  Invoke-Checked -FilePath "npm" -ArgumentList @("run", "quality") -PassThruOutput
}

Write-Step "Preparing Supabase config"
$supabaseUrl = Get-EnvValue "VITE_SUPABASE_URL"
$supabaseKey = Get-EnvValue "VITE_SUPABASE_PUBLISHABLE_KEY"
$projectRef = Get-EnvValue "SUPABASE_PROJECT_REF"
$dbPassword = Get-EnvValue "SUPABASE_DB_PASSWORD"
$schemaMode = Get-EnvValue "SUPABASE_SCHEMA_MODE"
if ([string]::IsNullOrWhiteSpace($schemaMode)) {
  $schemaMode = "schema"
}

if (-not $SkipSupabase) {
  Require-Env @("SUPABASE_ACCESS_TOKEN")
  $env:SUPABASE_ACCESS_TOKEN = Get-EnvValue "SUPABASE_ACCESS_TOKEN"

  if (-not (Test-EnvPresent @("SUPABASE_PROJECT_REF"))) {
    Require-Env @("SUPABASE_ORG_ID", "SUPABASE_PROJECT_NAME", "SUPABASE_DB_PASSWORD", "SUPABASE_REGION")
    Write-Step "Creating Supabase project"
    $createArgs = @(
      "supabase", "projects", "create", (Get-EnvValue "SUPABASE_PROJECT_NAME"),
      "--org-id", (Get-EnvValue "SUPABASE_ORG_ID"),
      "--db-password", (Get-EnvValue "SUPABASE_DB_PASSWORD"),
      "--region", (Get-EnvValue "SUPABASE_REGION"),
      "--output-format", "json"
    )
    $create = Invoke-Npx -ArgumentList $createArgs -PassThruOutput
    $created = Read-JsonOrNull $create.Output
    if ($created -and $created.ref) {
      $projectRef = $created.ref
      [Environment]::SetEnvironmentVariable("SUPABASE_PROJECT_REF", $projectRef, "Process")
      Write-Ok "Supabase project created: $projectRef"
    } else {
      Write-WarnLine "Supabase project creation output could not be parsed. Set SUPABASE_PROJECT_REF in .env.deploy if the next step fails."
      $projectRef = Get-EnvValue "SUPABASE_PROJECT_REF"
    }
  }

  Require-Env @("SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD")
  $projectRef = Get-EnvValue "SUPABASE_PROJECT_REF"
  $dbPassword = Get-EnvValue "SUPABASE_DB_PASSWORD"

  if ([string]::IsNullOrWhiteSpace($supabaseUrl)) {
    $supabaseUrl = "https://$projectRef.supabase.co"
    [Environment]::SetEnvironmentVariable("VITE_SUPABASE_URL", $supabaseUrl, "Process")
  }

  if ([string]::IsNullOrWhiteSpace($supabaseKey)) {
    Write-Step "Reading Supabase publishable key"
    $keys = Invoke-Npx -ArgumentList @("supabase", "projects", "api-keys", "--project-ref", $projectRef, "--output-format", "json")
    $parsedKeys = Read-JsonOrNull $keys.Output
    if ($parsedKeys) {
      $candidate = @($parsedKeys) | Where-Object {
        $_.name -match "anon|publishable" -or $_.api_key -or $_.key
      } | Select-Object -First 1
      if ($candidate) {
        $supabaseKey = $candidate.api_key
        if ([string]::IsNullOrWhiteSpace($supabaseKey)) {
          $supabaseKey = $candidate.key
        }
        [Environment]::SetEnvironmentVariable("VITE_SUPABASE_PUBLISHABLE_KEY", $supabaseKey, "Process")
      }
    }
    if ([string]::IsNullOrWhiteSpace($supabaseKey)) {
      Fail "Could not auto-read Supabase publishable key. Fill VITE_SUPABASE_PUBLISHABLE_KEY in .env.deploy."
    }
  }

  Write-LocalEnvFile -ProjectRoot $ProjectRoot -SupabaseUrl $supabaseUrl -SupabaseKey $supabaseKey

  Write-Step "Linking Supabase project"
  Invoke-Npx -ArgumentList @("supabase", "link", "--project-ref", $projectRef, "--password", $dbPassword, "--yes") -PassThruOutput

  switch ($schemaMode.ToLowerInvariant()) {
    "schema" {
      Write-Step "Applying supabase/schema.sql"
      Invoke-Npx -ArgumentList @("supabase", "db", "query", "--linked", "--file", "supabase/schema.sql") -PassThruOutput
    }
    "migrations" {
      Write-Step "Pushing Supabase migrations"
      Invoke-Npx -ArgumentList @("supabase", "db", "push", "--linked", "--password", $dbPassword, "--include-all", "--yes") -PassThruOutput
    }
    "skip" {
      Write-WarnLine "Skipping Supabase schema step because SUPABASE_SCHEMA_MODE=skip"
    }
    default {
      Fail "Invalid SUPABASE_SCHEMA_MODE=$schemaMode. Use schema, migrations, or skip."
    }
  }
}

Require-Env @("VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY")

if (-not $SkipGit) {
  Write-Step "Preparing GitHub repository"
  $githubRepo = Get-EnvValue "GITHUB_REPO"
  $githubToken = Get-EnvValue "GITHUB_TOKEN"
  if (-not [string]::IsNullOrWhiteSpace($githubRepo)) {
    if (-not [string]::IsNullOrWhiteSpace($githubToken)) {
      $repoUrl = "https://api.github.com/repos/$githubRepo"
      $headers = @{
        Authorization = "Bearer $githubToken"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent" = "rw-deploy-script"
      }
      try {
        Invoke-RestMethod -Uri $repoUrl -Headers $headers -Method Get | Out-Null
        Write-Ok "GitHub repo exists: $githubRepo"
      } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) {
          $owner = $githubRepo.Split("/")[0]
          $name = $githubRepo.Split("/")[1]
          $body = @{
            name = $name
            private = ((Get-EnvValue "GITHUB_PRIVATE") -ne "false")
          } | ConvertTo-Json
          Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $headers -Method Post -Body $body -ContentType "application/json" | Out-Null
          Write-Ok "GitHub repo created: $githubRepo"
        } else {
          throw
        }
      }
    }

    $remoteUrl = "https://github.com/$githubRepo.git"
    $existingRemote = (& git remote get-url origin 2>$null | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($existingRemote)) {
      Invoke-Checked -FilePath "git" -ArgumentList @("remote", "add", "origin", $remoteUrl) -PassThruOutput
    } else {
      Invoke-Checked -FilePath "git" -ArgumentList @("remote", "set-url", "origin", $remoteUrl) -PassThruOutput
    }
  }

  Assert-SecretFilesIgnored -ProjectRoot $ProjectRoot
  $commitMessage = Get-EnvValue "DEPLOY_COMMIT_MESSAGE"
  if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Prepare automated deployment"
  }

  Invoke-Checked -FilePath "git" -ArgumentList @("add", ".") -PassThruOutput
  $pending = (& git status --short | Out-String).Trim()
  if ($pending) {
    Invoke-Checked -FilePath "git" -ArgumentList @("commit", "-m", $commitMessage) -AllowFailure -PassThruOutput
  } else {
    Write-Ok "No Git changes to commit"
  }
  $branch = (& git branch --show-current | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($branch)) {
    $branch = "main"
    Invoke-Checked -FilePath "git" -ArgumentList @("branch", "-M", $branch) -PassThruOutput
  }
  if (-not [string]::IsNullOrWhiteSpace($githubToken)) {
    $pushHeader = "AUTHORIZATION: Bearer $githubToken"
    Invoke-Checked -FilePath "git" -ArgumentList @("-c", "http.https://github.com/.extraheader=$pushHeader", "push", "-u", "origin", $branch) -PassThruOutput
  } else {
    Invoke-Checked -FilePath "git" -ArgumentList @("push", "-u", "origin", $branch) -PassThruOutput
  }
}

Write-Step "Preparing Vercel"
Require-Env @("VERCEL_TOKEN", "VERCEL_PROJECT_NAME")
$vercelToken = Get-EnvValue "VERCEL_TOKEN"
$vercelProject = Get-EnvValue "VERCEL_PROJECT_NAME"
$vercelTeam = Get-EnvValue "VERCEL_TEAM_ID"

$vercelBaseArgs = @("--token", $vercelToken)
if (-not [string]::IsNullOrWhiteSpace($vercelTeam)) {
  $vercelBaseArgs += @("--scope", $vercelTeam)
}

$linkArgs = @("vercel", "link", "--yes", "--project", $vercelProject) + $vercelBaseArgs
if (-not [string]::IsNullOrWhiteSpace($vercelTeam)) {
  $linkArgs += @("--team", $vercelTeam)
}
Invoke-Npx -ArgumentList $linkArgs -PassThruOutput

if (-not $SkipVercelEnv) {
  Write-Step "Writing Vercel environment variables"
  $envTargets = @("production", "preview", "development")
  foreach ($target in $envTargets) {
    Invoke-Npx -ArgumentList (@("vercel", "env", "add", "VITE_SUPABASE_URL", $target, "--value", (Get-EnvValue "VITE_SUPABASE_URL"), "--force", "--yes") + $vercelBaseArgs) -PassThruOutput
    Invoke-Npx -ArgumentList (@("vercel", "env", "add", "VITE_SUPABASE_PUBLISHABLE_KEY", $target, "--value", (Get-EnvValue "VITE_SUPABASE_PUBLISHABLE_KEY"), "--force", "--yes") + $vercelBaseArgs) -PassThruOutput
  }
}

Write-Step "Deploying to Vercel ($deployTarget)"
$deployResult = Invoke-Npx -ArgumentList (@("vercel", "deploy", "--yes", "--project", $vercelProject) + $deployFlag + $vercelBaseArgs) -PassThruOutput
$deploymentUrl = ($deployResult.Output -split "\r?\n" | Where-Object { $_ -match "https://[^\s]+" } | Select-Object -Last 1)
if ($deploymentUrl -match "(https://[^\s]+)") {
  $deploymentUrl = $Matches[1].Trim()
  Write-Ok "Deployment URL: $deploymentUrl"
  [Environment]::SetEnvironmentVariable("DEPLOYMENT_URL", $deploymentUrl, "Process")
} else {
  Write-WarnLine "Could not parse deployment URL from Vercel output."
}

if ($Production) {
  $productionUrl = Get-EnvValue "PRODUCTION_URL"
  if ([string]::IsNullOrWhiteSpace($productionUrl) -and -not [string]::IsNullOrWhiteSpace($deploymentUrl)) {
    $productionUrl = $deploymentUrl
  }
  if (-not [string]::IsNullOrWhiteSpace($productionUrl)) {
    Write-WarnLine "Add this URL to Supabase Auth URL Configuration if it is not already there: $productionUrl/**"
  }
}

if (-not $SkipVerify) {
  Write-Step "Verifying deployment"
  if ([string]::IsNullOrWhiteSpace($deploymentUrl)) {
    $deploymentUrl = Get-EnvValue "PRODUCTION_URL"
  }
  if ([string]::IsNullOrWhiteSpace($deploymentUrl)) {
    Write-WarnLine "Skipping verification because no deployment URL was found."
  } else {
    Invoke-Checked -FilePath "node" -ArgumentList @("scripts/verify-production.mjs", $deploymentUrl) -PassThruOutput
  }
}

Write-Step "Done"
Write-Host "Target: $deployTarget" -ForegroundColor Green
if (-not [string]::IsNullOrWhiteSpace($deploymentUrl)) {
  Write-Host "URL: $deploymentUrl" -ForegroundColor Green
}

} catch {
  Write-Host ""
  Write-Host "DEPLOY FAILED" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
