@echo off
:: Script para crear acceso directo en el escritorio

set SCRIPT_DIR=%~dp0
set DESKTOP=%USERPROFILE%\Desktop

echo.
echo Creando acceso directo en el escritorio...

:: Crear VBS temporal para generar acceso directo
echo Set oWS = WScript.CreateObject("WScript.Shell") > CreateShortcut.vbs
echo sLinkFile = "%DESKTOP%\Ivan Reseller Web.lnk" >> CreateShortcut.vbs
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> CreateShortcut.vbs
echo oLink.TargetPath = "%SCRIPT_DIR%iniciar-sistema.bat" >> CreateShortcut.vbs
echo oLink.WorkingDirectory = "%SCRIPT_DIR%" >> CreateShortcut.vbs
echo oLink.Description = "Ivan Reseller Web - Sistema de Dropshipping" >> CreateShortcut.vbs
echo oLink.IconLocation = "%SystemRoot%\System32\SHELL32.dll,13" >> CreateShortcut.vbs
echo oLink.Save >> CreateShortcut.vbs

:: Ejecutar VBS
cscript CreateShortcut.vbs

:: Eliminar VBS temporal
del CreateShortcut.vbs

echo.
echo ✅ Acceso directo creado en el escritorio
echo    Nombre: "Ivan Reseller Web.lnk"
echo.
echo Ahora puedes hacer doble clic en el icono del escritorio
echo para iniciar el sistema automáticamente.
echo.

pause
