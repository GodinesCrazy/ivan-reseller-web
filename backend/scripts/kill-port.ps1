$conn = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
if ($conn -and $conn.OwningProcess) { Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force }
