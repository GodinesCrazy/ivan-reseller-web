# Create .env.local from env.local.example if .env.local does not exist.
# Usage: from backend dir: .\scripts\ensure-env-local.ps1
$backendDir = Split-Path $PSScriptRoot -Parent
$example = Join-Path $backendDir "env.local.example"
$target = Join-Path $backendDir ".env.local"
if (-not (Test-Path $target)) {
  if (Test-Path $example) {
    Copy-Item $example $target
    Write-Host "Created .env.local from env.local.example. Replace REPLACE_ME with real values."
  } else {
    Write-Host "env.local.example not found; cannot create .env.local"
    exit 1
  }
} else {
  Write-Host ".env.local already exists; not overwriting."
}
