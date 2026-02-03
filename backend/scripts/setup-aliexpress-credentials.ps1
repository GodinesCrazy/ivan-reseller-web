# Setup AliExpress OAuth credentials for local development
# Run: .\scripts\setup-aliexpress-credentials.ps1
# Get App Key and App Secret from: https://portals.aliexpress.com/

$envPath = Join-Path $PSScriptRoot ".." ".env.local"
$content = @()

if (Test-Path $envPath) {
    $lines = Get-Content $envPath
    $updated = $false
    foreach ($line in $lines) {
        if ($line -match '^ALIEXPRESS_APP_KEY=') {
            $key = Read-Host "Enter ALIEXPRESS_APP_KEY (from AliExpress Open Platform)"
            $content += "ALIEXPRESS_APP_KEY=$key"
            $updated = $true
        } elseif ($line -match '^ALIEXPRESS_APP_SECRET=') {
            $secret = Read-Host "Enter ALIEXPRESS_APP_SECRET" -AsSecureString
            $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
            $secretPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
            $content += "ALIEXPRESS_APP_SECRET=$secretPlain"
            $updated = $true
        } else {
            $content += $line
        }
    }
    if (-not $updated) {
        $key = Read-Host "Enter ALIEXPRESS_APP_KEY"
        $secret = Read-Host "Enter ALIEXPRESS_APP_SECRET" -AsSecureString
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $secretPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        $content += "ALIEXPRESS_APP_KEY=$key"
        $content += "ALIEXPRESS_APP_SECRET=$secretPlain"
    }
} else {
    $key = Read-Host "Enter ALIEXPRESS_APP_KEY"
    $secret = Read-Host "Enter ALIEXPRESS_APP_SECRET" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $secretPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    $content = @(
        "ALIEXPRESS_APP_KEY=$key",
        "ALIEXPRESS_APP_SECRET=$secretPlain",
        "ALIEXPRESS_REDIRECT_URI=http://localhost:4000/api/aliexpress/callback",
        "ALIEXPRESS_TRACKING_ID=ivanreseller"
    )
}

$content | Set-Content $envPath -Encoding UTF8
Write-Host "Updated $envPath"
Write-Host "Restart backend: npm run dev"
