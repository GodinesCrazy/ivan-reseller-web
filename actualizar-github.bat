@echo off
REM ============================================
REM ACTUALIZAR PROYECTO EN GITHUB
REM ============================================

echo.
echo ACTUALIZAR PROYECTO EN GITHUB
echo ==========================================
echo.

REM Verificar que estamos en el directorio correcto
if not exist "backend\" (
    echo ERROR: Debes ejecutar este script desde la raiz del proyecto
    pause
    exit /b 1
)

REM Ejecutar script de PowerShell
powershell.exe -ExecutionPolicy Bypass -File "actualizar-github.ps1"

pause

