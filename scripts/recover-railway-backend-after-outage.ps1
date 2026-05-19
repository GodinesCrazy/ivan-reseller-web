param(
  [string]$ServiceName = "ivan-reseller-backend",
  [string]$BackendUrl = "https://ivan-reseller-backend-production.up.railway.app",
  [int]$MaxAttempts = 12,
  [int]$SleepSeconds = 300,
  [switch]$SkipRedeploy
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-CommandText {
  param(
    [string]$Command,
    [string]$WorkingDirectory = $RepoRoot
  )

  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process -FilePath "cmd.exe" `
      -ArgumentList @("/c", $Command) `
      -WorkingDirectory $WorkingDirectory `
      -NoNewWindow `
      -PassThru `
      -Wait `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath
    $stdout = Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue
    $stderr = Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue
    $output = (($stdout, $stderr) | Where-Object { $_ } | Out-String).Trim()
    $code = $process.ExitCode
    return [pscustomobject]@{
      Ok = $code -eq 0
      ExitCode = $code
      Output = $output
    }
  } finally {
    Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Test-HttpEndpoint {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
    $content = [string]$response.Content
    if ($content.Length -gt 240) {
      $content = $content.Substring(0, 240)
    }
    return [pscustomobject]@{
      Ok = $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
      Status = $response.StatusCode
      Body = $content
      Error = $null
    }
  } catch {
    $status = "NO_RESPONSE"
    if ($_.Exception.Response) {
      try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    }
    return [pscustomobject]@{
      Ok = $false
      Status = $status
      Body = ""
      Error = $_.Exception.Message
    }
  }
}

function Test-Backend {
  param([string]$BaseUrl)

  $paths = @(
    "/health",
    "/api/connectivity",
    "/api/cj-shopify-usa/pico/status"
  )

  $results = foreach ($path in $paths) {
    $url = "$BaseUrl$path"
    $result = Test-HttpEndpoint -Url $url
    [pscustomobject]@{
      Url = $url
      Ok = $result.Ok
      Status = $result.Status
      Error = $result.Error
      Body = $result.Body
    }
  }

  $results | Format-Table Url, Ok, Status, Error -AutoSize
  return $results
}

Write-Step "Railway backend recovery"
Write-Host "Service: $ServiceName"
Write-Host "Backend: $BackendUrl"
Write-Host "Attempts: $MaxAttempts"
Write-Host "Sleep: $SleepSeconds seconds"

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  Write-Step "Attempt $attempt/$MaxAttempts - checking Railway CLI session"

  $whoami = Invoke-CommandText -Command "railway whoami" -WorkingDirectory $BackendDir
  if (-not $whoami.Ok) {
    Write-Host "Railway CLI not ready." -ForegroundColor Yellow
    Write-Host $whoami.Output
    if ($attempt -lt $MaxAttempts) {
      Start-Sleep -Seconds $SleepSeconds
      continue
    }
    exit 2
  }

  Write-Host "Railway session OK: $($whoami.Output)" -ForegroundColor Green

  Write-Step "Checking service status"
  $status = Invoke-CommandText -Command "railway service status --service $ServiceName" -WorkingDirectory $BackendDir
  Write-Host $status.Output

  if (-not $SkipRedeploy) {
    Write-Step "Redeploying backend service"
    $redeploy = Invoke-CommandText -Command "railway service redeploy -s $ServiceName -y" -WorkingDirectory $BackendDir
    Write-Host $redeploy.Output
    if (-not $redeploy.Ok) {
      Write-Host "Redeploy command failed." -ForegroundColor Red
      if ($attempt -lt $MaxAttempts) {
        Start-Sleep -Seconds $SleepSeconds
        continue
      }
      exit 3
    }
  } else {
    Write-Host "SkipRedeploy enabled; validating only." -ForegroundColor Yellow
  }

  Write-Step "Waiting for backend boot"
  Start-Sleep -Seconds 90

  Write-Step "Validating backend endpoints"
  $endpointResults = Test-Backend -BaseUrl $BackendUrl
  $healthOk = ($endpointResults | Where-Object { $_.Url -like "*/health" }).Ok -eq $true
  $connectivityOk = ($endpointResults | Where-Object { $_.Url -like "*/api/connectivity" }).Ok -eq $true

  if ($healthOk -and $connectivityOk) {
    Write-Host "Backend recovery verified." -ForegroundColor Green
    exit 0
  }

  Write-Host "Backend not healthy yet." -ForegroundColor Yellow
  if ($attempt -lt $MaxAttempts) {
    Start-Sleep -Seconds $SleepSeconds
  }
}

Write-Host "Recovery attempts exhausted." -ForegroundColor Red
exit 4
