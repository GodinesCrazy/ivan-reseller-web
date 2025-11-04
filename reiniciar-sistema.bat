@echo off
chcp 65001 >nul

:: ============================================
:: IVAN RESELLER WEB - REINICIAR SISTEMA
:: ============================================

title Ivan Reseller Web - Reiniciar Sistema

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║       🔄 IVAN RESELLER WEB - REINICIAR SISTEMA            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

echo [1/2] 🛑 Deteniendo sistema actual...
echo.

call detener-sistema.bat

echo.
echo [2/2] 🚀 Iniciando sistema nuevamente...
echo.

timeout /t 2 /nobreak >nul

call iniciar-sistema.bat
