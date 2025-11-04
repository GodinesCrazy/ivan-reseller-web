@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================
:: IVAN RESELLER WEB - VERIFICAR SISTEMA
:: ============================================

title Ivan Reseller Web - Verificación del Sistema

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║      🔍 IVAN RESELLER WEB - VERIFICACIÓN SISTEMA          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

set ERRORS=0
set WARNINGS=0

:: ============================================
:: 1. VERIFICAR NODE.JS
:: ============================================

echo [1/10] Verificando Node.js...

where node >nul 2>&1
if errorlevel 1 (
    echo    ❌ Node.js NO está instalado
    set /a ERRORS+=1
) else (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo    ✅ Node.js !NODE_VERSION! detectado
)

echo.

:: ============================================
:: 2. VERIFICAR NPM
:: ============================================

echo [2/10] Verificando npm...

where npm >nul 2>&1
if errorlevel 1 (
    echo    ❌ npm NO está instalado
    set /a ERRORS+=1
) else (
    for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
    echo    ✅ npm !NPM_VERSION! detectado
)

echo.

:: ============================================
:: 3. VERIFICAR ESTRUCTURA DE DIRECTORIOS
:: ============================================

echo [3/10] Verificando estructura de directorios...

if not exist "backend" (
    echo    ❌ Directorio "backend" NO encontrado
    set /a ERRORS+=1
) else (
    echo    ✅ Directorio "backend" encontrado
)

if not exist "frontend" (
    echo    ❌ Directorio "frontend" NO encontrado
    set /a ERRORS+=1
) else (
    echo    ✅ Directorio "frontend" encontrado
)

if exist "ivan_reseller" (
    echo    ✅ Directorio "ivan_reseller" encontrado (Scraper Python)
) else (
    echo    ⚠️  Directorio "ivan_reseller" NO encontrado (opcional)
    set /a WARNINGS+=1
)

echo.

:: ============================================
:: 4. VERIFICAR ARCHIVOS .ENV
:: ============================================

echo [4/10] Verificando archivos .env...

if not exist "backend\.env" (
    echo    ⚠️  backend\.env NO existe (se creará al iniciar)
    set /a WARNINGS+=1
) else (
    echo    ✅ backend\.env existe
)

if not exist "frontend\.env" (
    echo    ⚠️  frontend\.env NO existe (se creará al iniciar)
    set /a WARNINGS+=1
) else (
    echo    ✅ frontend\.env existe
)

echo.

:: ============================================
:: 5. VERIFICAR DEPENDENCIAS BACKEND
:: ============================================

echo [5/10] Verificando dependencias backend...

if not exist "backend\node_modules" (
    echo    ⚠️  node_modules backend NO existe (se instalará al iniciar)
    set /a WARNINGS+=1
) else (
    echo    ✅ node_modules backend existe
)

if not exist "backend\package.json" (
    echo    ❌ package.json backend NO encontrado
    set /a ERRORS+=1
) else (
    echo    ✅ package.json backend encontrado
)

echo.

:: ============================================
:: 6. VERIFICAR DEPENDENCIAS FRONTEND
:: ============================================

echo [6/10] Verificando dependencias frontend...

if not exist "frontend\node_modules" (
    echo    ⚠️  node_modules frontend NO existe (se instalará al iniciar)
    set /a WARNINGS+=1
) else (
    echo    ✅ node_modules frontend existe
)

if not exist "frontend\package.json" (
    echo    ❌ package.json frontend NO encontrado
    set /a ERRORS+=1
) else (
    echo    ✅ package.json frontend encontrado
)

echo.

:: ============================================
:: 7. VERIFICAR BASE DE DATOS
:: ============================================

echo [7/10] Verificando base de datos...

if not exist "backend\prisma" (
    echo    ❌ Directorio "backend\prisma" NO encontrado
    set /a ERRORS+=1
) else (
    echo    ✅ Directorio "backend\prisma" encontrado
)

if not exist "backend\prisma\schema.prisma" (
    echo    ❌ schema.prisma NO encontrado
    set /a ERRORS+=1
) else (
    echo    ✅ schema.prisma encontrado
)

if not exist "backend\prisma\dev.db" (
    echo    ⚠️  Base de datos NO existe (se creará al iniciar)
    set /a WARNINGS+=1
) else (
    echo    ✅ Base de datos existe
)

echo.

:: ============================================
:: 8. VERIFICAR PUERTOS DISPONIBLES
:: ============================================

echo [8/10] Verificando puertos...

netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo    ✅ Puerto 3000 (Backend) disponible
) else (
    echo    ⚠️  Puerto 3000 (Backend) OCUPADO
    set /a WARNINGS+=1
)

netstat -ano | findstr :5173 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo    ✅ Puerto 5173 (Frontend) disponible
) else (
    echo    ⚠️  Puerto 5173 (Frontend) OCUPADO
    set /a WARNINGS+=1
)

netstat -ano | findstr :8077 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo    ✅ Puerto 8077 (Scraper) disponible
) else (
    echo    ⚠️  Puerto 8077 (Scraper) OCUPADO (opcional)
)

echo.

:: ============================================
:: 9. VERIFICAR PYTHON (OPCIONAL)
:: ============================================

echo [9/10] Verificando Python (opcional)...

where python >nul 2>&1
if errorlevel 1 (
    echo    ⚠️  Python NO detectado (opcional para scraper)
) else (
    for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
    echo    ✅ !PYTHON_VERSION! detectado
)

echo.

:: ============================================
:: 10. VERIFICAR SCRIPTS DE INICIO
:: ============================================

echo [10/10] Verificando scripts de inicio...

if not exist "iniciar-sistema.bat" (
    echo    ❌ iniciar-sistema.bat NO encontrado
    set /a ERRORS+=1
) else (
    echo    ✅ iniciar-sistema.bat encontrado
)

if not exist "detener-sistema.bat" (
    echo    ❌ detener-sistema.bat NO encontrado
    set /a ERRORS+=1
) else (
    echo    ✅ detener-sistema.bat encontrado
)

if not exist "reiniciar-sistema.bat" (
    echo    ⚠️  reiniciar-sistema.bat NO encontrado
    set /a WARNINGS+=1
) else (
    echo    ✅ reiniciar-sistema.bat encontrado
)

echo.

:: ============================================
:: RESUMEN
:: ============================================

echo ╔════════════════════════════════════════════════════════════╗
echo ║                    RESUMEN DE VERIFICACIÓN                 ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

if %ERRORS% equ 0 (
    if %WARNINGS% equ 0 (
        echo ✅ SISTEMA PERFECTO - Sin errores ni advertencias
        echo.
        echo 🚀 Puedes iniciar el sistema con: iniciar-sistema.bat
    ) else (
        echo ⚠️  SISTEMA OK CON ADVERTENCIAS
        echo.
        echo    Errores:      %ERRORS%
        echo    Advertencias: %WARNINGS%
        echo.
        echo 💡 Las advertencias se resolverán automáticamente al iniciar
        echo 🚀 Puedes iniciar el sistema con: iniciar-sistema.bat
    )
) else (
    echo ❌ SISTEMA CON ERRORES
    echo.
    echo    Errores:      %ERRORS%
    echo    Advertencias: %WARNINGS%
    echo.
    echo 🔧 Acciones requeridas:
    echo.
    
    where node >nul 2>&1
    if errorlevel 1 (
        echo    1. Instalar Node.js desde: https://nodejs.org/
    )
    
    if not exist "backend" (
        echo    2. Verificar que estás en el directorio correcto
    )
    
    if not exist "backend\package.json" (
        echo    3. Restaurar archivos del proyecto
    )
    
    echo.
    echo ⚠️  No inicies el sistema hasta resolver los errores
)

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

:: ============================================
:: INFORMACIÓN ADICIONAL
:: ============================================

if %ERRORS% equ 0 (
    echo 📋 Próximos pasos:
    echo.
    echo    1. Ejecuta: iniciar-sistema.bat
    echo    2. Espera 15-20 segundos
    echo    3. Accede a: http://localhost:5173
    echo    4. Login: admin@ivanreseller.com / admin123
    echo.
    echo 📚 Documentación:
    echo    - SCRIPTS_INICIO.md (guía completa)
    echo    - GUIA_VISUAL_SCRIPTS.md (guía visual)
    echo    - COMO_INICIAR_Y_PROBAR.md (pruebas)
    echo.
)

pause

endlocal
