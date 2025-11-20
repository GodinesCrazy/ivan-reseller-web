@echo off
REM ✅ F7: Script de backup automático de base de datos PostgreSQL (Windows)
REM Uso: scripts\backup-db.bat [backup_directory]

setlocal enabledelayedexpansion

REM Configuración
set BACKUP_DIR=%~1
if "%BACKUP_DIR%"=="" set BACKUP_DIR=.\backups
set TIMESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

set DB_NAME=%POSTGRES_DB%
if "%DB_NAME%"=="" set DB_NAME=ivan_reseller

set DB_USER=%POSTGRES_USER%
if "%DB_USER%"=="" set DB_USER=postgres

set DB_HOST=%POSTGRES_HOST%
if "%DB_HOST%"=="" set DB_HOST=localhost

set DB_PORT=%POSTGRES_PORT%
if "%DB_PORT%"=="" set DB_PORT=5432

REM Crear directorio de backups si no existe
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM Nombre del archivo de backup
set BACKUP_FILE=%BACKUP_DIR%\backup_%DB_NAME%_%TIMESTAMP%.sql.gz

echo.
echo [Backup de Base de Datos]
echo ========================================
echo Base de datos: %DB_NAME%
echo Host: %DB_HOST%:%DB_PORT%
echo Archivo: %BACKUP_FILE%
echo.

REM Verificar que pg_dump esté disponible
where pg_dump >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: pg_dump no encontrado
    echo Instala PostgreSQL client tools
    pause
    exit /b 1
)

REM Realizar backup
echo Realizando backup...
set PGPASSWORD=%POSTGRES_PASSWORD%
pg_dump -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% --no-owner --no-acl --format=custom | gzip > "%BACKUP_FILE%"

if %errorLevel% equ 0 (
    echo.
    echo OK - Backup completado exitosamente
    echo Archivo: %BACKUP_FILE%
    echo.
    echo Limpiando backups antiguos (mayores a 30 dias)...
    forfiles /p "%BACKUP_DIR%" /m backup_*.sql.gz /d -30 /c "cmd /c del @path" >nul 2>&1
    echo OK - Limpieza completada
) else (
    echo.
    echo ERROR - Error al realizar backup
    pause
    exit /b 1
)

endlocal

