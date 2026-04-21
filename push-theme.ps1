$ErrorActionPreference = 'Stop'
$shopifyPath = "C:\Users\ivanm\AppData\Roaming\npm\shopify.cmd"
$workingDir = "c:\Ivan_Reseller_Web\shopify-themes\horizon-theme"

# Create process info
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $shopifyPath
$psi.Arguments = "theme push --theme 161552826580 --store ivanreseller-2.myshopify.com --force"
$psi.WorkingDirectory = $workingDir
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $false

$process = [System.Diagnostics.Process]::Start($psi)

# Wait for prompt
Start-Sleep -Seconds 3

# Send 'y' and Enter
$process.StandardInput.WriteLine("y")

# Wait for completion
$process.WaitForExit(180000)

$stdOutput = $process.StandardOutput.ReadToEnd()
$stdError = $process.StandardError.ReadToEnd()

Write-Host "Output: $stdOutput"
Write-Host "Error: $stdError"
Write-Host "Exit code: $($process.ExitCode)"

exit $process.ExitCode
