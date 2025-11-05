@echo off
REM ============================================
REM DEPLOYMENT AUTOMATICO - IVAN RESELLER
REM ============================================
REM Ejecuta este script para guia paso a paso

echo.
echo DEPLOYMENT AUTOMATICO - IVAN RESELLER
echo =========================================
echo.

REM Verificar que estamos en el directorio correcto
if not exist "backend\" (
    echo ERROR: Debes ejecutar este script desde la raiz del proyecto
    pause
    exit /b 1
)

REM Ejecutar script de PowerShell
powershell.exe -ExecutionPolicy Bypass -File "deploy-automatico.ps1"

pause

