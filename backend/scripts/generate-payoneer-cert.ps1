# Generate Payoneer SSL certificate for backend/security
# Requires OpenSSL. Run as: .\generate-payoneer-cert.ps1
# If OpenSSL not found, install: choco install openssl.light -y (run PowerShell as Admin)

$secDir = Join-Path $PSScriptRoot "..\security"
$keyPath = Join-Path $secDir "payoneer.key"
$crtPath = Join-Path $secDir "payoneer.crt"

if (-not (Test-Path $secDir)) { New-Item -ItemType Directory -Path $secDir -Force | Out-Null }

$openssl = (Get-Command openssl -ErrorAction SilentlyContinue)?.Source
if (-not $openssl) {
    $chocoPath = "C:\ProgramData\chocolatey\bin\openssl.exe"
    if (Test-Path $chocoPath) { $openssl = $chocoPath }
}
if (-not $openssl) {
    Write-Host "OpenSSL not found. Install with: choco install openssl.light -y (run as Admin)"
    exit 1
}

$subj = "/C=US/ST=State/L=City/O=IvanReseller/OU=Engineering/CN=ivanreseller.com"
& $openssl req -x509 -newkey rsa:2048 -keyout $keyPath -out $crtPath -days 3650 -nodes -subj $subj

if ((Test-Path $keyPath) -and (Test-Path $crtPath)) {
    Write-Host "Certificate created: $crtPath, $keyPath"
    exit 0
} else {
    Write-Host "Certificate generation failed"
    exit 1
}
