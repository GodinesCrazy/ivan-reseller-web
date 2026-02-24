Write-Host "Stopping all Node processes..."
taskkill /IM node.exe /F 2>$null

Write-Host "Waiting 2 seconds..."
Start-Sleep -Seconds 2

Write-Host "Starting backend..."
cd backend
npm run dev
