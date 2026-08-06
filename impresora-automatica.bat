@echo off
REM ====================================================================
REM  El Marisquito - Estacion de impresion automatica
REM  Abre Chrome en modo "kiosk-printing": imprime directo a la
REM  impresora predeterminada de Windows, SIN mostrar ningun dialogo.
REM ====================================================================

REM IMPORTANTE: cierra todas las ventanas de Chrome antes de correr esto,
REM o el modo kiosk-printing no va a funcionar (Chrome solo aplica las
REM banderas si no hay otro proceso de Chrome ya corriendo -- incluyendo
REM procesos en segundo plano que a veces quedan vivos aunque cierres la
REM ventana. Si esto sigue fallando, apaga en Chrome:
REM   chrome://settings/system -> "Seguir ejecutando aplicaciones en
REM   segundo plano cuando Google Chrome este cerrado"
taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul
taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

REM Cambia esta URL si tu servidor corre en otra direccion o ya esta en Render.
REM IMPORTANTE: debe apuntar a la CONSOLA de la estacion que imprime (cocina.html,
REM barra.html, admin.html o caja.html) -- impresora.html YA NO imprime nada solo,
REM es solo el Centro de Impresion (historial / reimprimir).
set URL=http://localhost:3000/cocina.html

REM Ruta comun de Chrome en Windows (ajusta si tu instalacion es distinta)
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

start "" %CHROME_PATH% --kiosk-printing --app=%URL%
