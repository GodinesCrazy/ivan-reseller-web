$ErrorActionPreference = 'Stop'
$shopifyPath = "C:\Users\ivanm\AppData\Roaming\npm\shopify.cmd"
$workingDir = "c:\Ivan_Reseller_Web\shopify-themes\horizon-theme"

# Create process info for unpublished theme push
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $shopifyPath
$psi.Arguments = "theme push --unpublished --store ivanreseller-2.myshopify.com --json"
$psi.WorkingDirectory = $workingDir
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $false

$process = [System.Diagnostics.Process]::Start($psi)

Start-Sleep -Seconds 3

# Send theme name
$process.StandardInput.WriteLine("Ivan Reseller Premium Preview")

Start-Sleep -Seconds 2

$output = $process.StandardOutput.ReadToEnd()
$stdError = $process.StandardError.ReadToEnd()

Write-Host "Output: $output"
if ($stdError) { Write-Host "Error: $stdError" }

$process.WaitForExit(30000)
Write-Host "Exit code: $($process.ExitCode)"

exit $process.ExitCode
