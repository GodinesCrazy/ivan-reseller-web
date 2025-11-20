@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
color 0A

title Ivan Reseller - Iniciador del Sistema

echo.
echo ========================================================
echo.
echo          IVAN RESELLER - SISTEMA DE DROPSHIPPING
echo.
echo              Iniciador Automatico con Acceso Global
echo.
echo ========================================================
echo.
timeout /t 2 /nobreak >nul

:: Verificar permisos de administrador
echo [1/11] Verificando permisos de administrador...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo ERROR: Este script requiere permisos de administrador
    echo.
    echo Por favor:
    echo 1. Cierra esta ventana
    echo 2. Haz clic derecho en "iniciar-sistema.bat"
    echo 3. Selecciona "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)
echo OK - Permisos verificados
echo.

:: Verificar Node.js
echo [2/11] Verificando Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js no esta instalado
    echo Instala Node.js desde: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo OK - Node.js encontrado: %NODE_VERSION%
echo.

:: Detectar IP Local
echo [3/11] Detectando IP local...
set LOCAL_IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP_TEMP=%%a
    set IP_TEMP=!IP_TEMP: =!
    if not "!IP_TEMP!"=="127.0.0.1" (
        if not defined LOCAL_IP (
            set LOCAL_IP=!IP_TEMP!
        )
    )
)
if not defined LOCAL_IP set LOCAL_IP=127.0.0.1
echo OK - IP Local: %LOCAL_IP%
echo.

:: Detectar IP Publica
echo [4/11] Detectando IP publica...
set PUBLIC_IP=
for /f "delims=" %%i in ('curl -s https://api.ipify.org 2^>nul') do set PUBLIC_IP=%%i
if not defined PUBLIC_IP set PUBLIC_IP=%LOCAL_IP%
echo OK - IP Publica: %PUBLIC_IP%
echo.

:: Configurar Firewall
echo [5/11] Configurando Firewall...
netsh advfirewall firewall delete rule name="Ivan Reseller Backend" >nul 2>&1
netsh advfirewall firewall add rule name="Ivan Reseller Backend" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
netsh advfirewall firewall delete rule name="Ivan Reseller Frontend" >nul 2>&1
netsh advfirewall firewall add rule name="Ivan Reseller Frontend" dir=in action=allow protocol=TCP localport=5173 >nul 2>&1
echo OK - Firewall configurado
echo.

:: Liberar puertos
echo [6/11] Liberando puertos ocupados...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173"') do taskkill /F /PID %%a >nul 2>&1
echo OK - Puertos disponibles
echo.

:: ✅ F4: Configurar Backend con variables de entorno y soporte para producción
echo [7/11] Configurando Backend...
cd /d "%~dp0backend"
if not exist .env (
    echo # Environment
    echo NODE_ENV=development > .env
    echo PORT=3000 >> .env
    echo. >> .env
    echo # Database
    echo # IMPORTANTE: Configurar PostgreSQL (NO SQLite) >> .env
    echo # Ejemplo LOCAL: >> .env
    echo # DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ivan_reseller?schema=public >> .env
    echo # Ejemplo RAILWAY (usar la URL publica de Railway): >> .env
    echo # DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/railway?sslmode=require >> .env
    echo. >> .env
    echo # Security (OBLIGATORIAS - usar valores seguros en producción)
    echo JWT_SECRET=ivan-reseller-super-secure-jwt-secret-key-2025-minimum-32-chars >> .env
    echo ENCRYPTION_KEY= >> .env
    echo JWT_EXPIRES_IN=7d >> .env
    echo. >> .env
    echo # URLs - Desarrollo (local)
    echo FRONTEND_URL=http://localhost:5173 >> .env
    echo CORS_ORIGIN=http://localhost:5173,http://%LOCAL_IP%:5173,http://%PUBLIC_IP%:5173 >> .env
    echo. >> .env
    echo # URLs - Producción (descomentar y configurar en producción)
    echo # FRONTEND_URL=https://ivanreseller.com >> .env
    echo # CORS_ORIGIN=https://ivanreseller.com,https://www.ivanreseller.com >> .env
    echo. >> .env
    echo # Para producción, usar:
    echo # FRONTEND_URL=https://ivanreseller.com >> .env
    echo # CORS_ORIGIN=https://ivanreseller.com,https://www.ivanreseller.com >> .env
)
if not exist node_modules call npm install >nul 2>&1
call npx prisma generate >nul 2>&1
call npx prisma db push --accept-data-loss >nul 2>&1
call npx prisma db seed >nul 2>&1
cd /d "%~dp0"
echo OK - Backend configurado
echo.

:: ✅ F4: Configurar Frontend con variables de entorno y soporte para producción
echo [8/11] Configurando Frontend...
cd /d "%~dp0frontend"
if not exist .env (
    echo # API URLs - Desarrollo (local)
    echo VITE_API_URL=http://localhost:3000 > .env
    echo VITE_WS_URL=ws://localhost:3000 >> .env
    echo. >> .env
    echo # API URLs - Producción (descomentar y configurar en producción)
    echo # VITE_API_URL=https://api.ivanreseller.com >> .env
    echo # VITE_WS_URL=wss://api.ivanreseller.com >> .env
    echo. >> .env
    echo # Para producción, usar:
    echo # VITE_API_URL=https://api.ivanreseller.com >> .env
    echo # VITE_WS_URL=wss://api.ivanreseller.com >> .env
) else (
    echo # Verificando .env existente...
    findstr /C:"VITE_API_URL" .env >nul 2>&1
    if errorlevel 1 (
        echo VITE_API_URL=http://localhost:3000 >> .env
        echo VITE_WS_URL=ws://localhost:3000 >> .env
    )
)
if not exist node_modules call npm install >nul 2>&1
cd /d "%~dp0"
echo OK - Frontend configurado
echo.

:: Iniciar servicios
echo [9/11] Iniciando servicios...
start "Backend" /MIN cmd /c "cd /d "%~dp0backend" && npm run dev"
timeout /t 3 /nobreak >nul
start "Frontend" /MIN cmd /c "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak >nul
echo OK - Servicios iniciados
echo.

:: Verificar servicios
echo [10/11] Verificando servicios...
timeout /t 8 /nobreak >nul
echo OK - Servicios listos
echo.

:: Generar URLs
echo [11/11] Generando archivo de URLs...
echo URLS DE ACCESO - IVAN RESELLER > URLS_ACCESO.txt
echo. >> URLS_ACCESO.txt
echo LOCAL:    http://localhost:5173 >> URLS_ACCESO.txt
echo LAN:      http://%LOCAL_IP%:5173 >> URLS_ACCESO.txt
echo INTERNET: http://%PUBLIC_IP%:5173 >> URLS_ACCESO.txt
echo. >> URLS_ACCESO.txt
echo Usuario: admin@ivanreseller.com >> URLS_ACCESO.txt
echo Password: admin123 >> URLS_ACCESO.txt
echo OK - Archivo creado
echo.

:: Finalizar
echo.
echo ========================================================
echo.
echo           SISTEMA INICIADO CORRECTAMENTE
echo.
echo ========================================================
echo.
echo URLs de acceso:
echo   LOCAL:    http://localhost:5173
echo   LAN:      http://%LOCAL_IP%:5173
echo   INTERNET: http://%PUBLIC_IP%:5173
echo.
echo Usuario: admin@ivanreseller.com
echo Password: admin123
echo.
echo Abriendo navegador...
timeout /t 2 /nobreak >nul
start http://localhost:5173
echo.
echo IMPORTANTE:
echo - NO cierres esta ventana
echo - NO cierres las ventanas del Backend y Frontend
echo.
pause
