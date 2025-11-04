@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================
:: IVAN RESELLER WEB - DETENER SISTEMA
:: ============================================

title Ivan Reseller Web - Detener Sistema

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║        🛑 IVAN RESELLER WEB - DETENER SISTEMA             ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Contador de procesos detenidos
set COUNT=0

:: ============================================
:: DETENER PROCESOS EN PUERTO 3000 (Backend)
:: ============================================

echo 🔍 Buscando procesos en puerto 3000 (Backend)...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    set PID=%%a
    if "!PID!" neq "0" (
        for /f "tokens=1" %%b in ('tasklist /FI "PID eq !PID!" /NH ^| findstr /I "node.exe"') do (
            echo    Deteniendo proceso !PID! (Backend)...
            taskkill /F /PID !PID! >nul 2>&1
            if not errorlevel 1 (
                echo    ✅ Backend detenido
                set /a COUNT+=1
            )
        )
    )
)

:: ============================================
:: DETENER PROCESOS EN PUERTO 5173 (Frontend)
:: ============================================

echo 🔍 Buscando procesos en puerto 5173 (Frontend)...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    set PID=%%a
    if "!PID!" neq "0" (
        for /f "tokens=1" %%b in ('tasklist /FI "PID eq !PID!" /NH ^| findstr /I "node.exe"') do (
            echo    Deteniendo proceso !PID! (Frontend)...
            taskkill /F /PID !PID! >nul 2>&1
            if not errorlevel 1 (
                echo    ✅ Frontend detenido
                set /a COUNT+=1
            )
        )
    )
)

:: ============================================
:: DETENER PROCESOS EN PUERTO 8077 (Scraper)
:: ============================================

echo 🔍 Buscando procesos en puerto 8077 (Scraper Python)...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8077 ^| findstr LISTENING') do (
    set PID=%%a
    if "!PID!" neq "0" (
        for /f "tokens=1" %%b in ('tasklist /FI "PID eq !PID!" /NH ^| findstr /I "python.exe"') do (
            echo    Deteniendo proceso !PID! (Scraper)...
            taskkill /F /PID !PID! >nul 2>&1
            if not errorlevel 1 (
                echo    ✅ Scraper detenido
                set /a COUNT+=1
            )
        )
    )
)

:: ============================================
:: DETENER VENTANAS MINIMIZADAS
:: ============================================

echo 🔍 Buscando ventanas de "Ivan Reseller"...

:: Buscar y cerrar ventanas por título
for /f "tokens=2" %%a in ('tasklist /V ^| findstr /I "Ivan Reseller"') do (
    set PID=%%a
    if "!PID!" neq "0" (
        taskkill /F /PID !PID! >nul 2>&1
        if not errorlevel 1 (
            set /a COUNT+=1
        )
    )
)

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║               ✅ SISTEMA DETENIDO                          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

if %COUNT% gtr 0 (
    echo 🛑 Se detuvieron %COUNT% proceso^(s^) relacionado^(s^) con Ivan Reseller
) else (
    echo ℹ️  No se encontraron procesos activos de Ivan Reseller
)

echo.
echo 📝 Puertos liberados:
echo    - 3000 (Backend)
echo    - 5173 (Frontend)
echo    - 8077 (Scraper)
echo.
echo ✅ Puedes volver a iniciar el sistema con: iniciar-sistema.bat
echo.

pause

endlocal
