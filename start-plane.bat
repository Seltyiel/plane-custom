@echo off
setlocal enableextensions
echo ==========================================
echo   Start Plane (stack completo con web custom)
echo ==========================================
echo.

cd /d "%~dp0"

REM 1) Verifica immagine custom
docker image inspect plane-web-custom:latest >nul 2>&1
if errorlevel 1 (
    echo ERRORE: l'immagine plane-web-custom:latest non esiste.
    echo Esegui prima build.bat per costruirla.
    pause
    exit /b 1
)

REM 2) Assicurati che esista la cartella plane-app
if not exist "..\plane-app" (
    mkdir "..\plane-app"
)

REM 3) Copia i file di setup (sovrascrive solo se mancano)
if not exist "..\plane-app\docker-compose.yml" (
    copy /Y "plane-setup\docker-compose.yml" "..\plane-app\docker-compose.yml" >nul
    echo   Installato docker-compose.yml
)
if not exist "..\plane-app\plane.env" (
    copy /Y "plane-setup\plane.env" "..\plane-app\plane.env" >nul
    echo   Installato plane.env
)

REM Override: sempre aggiornato (punta web a plane-web-custom:latest)
copy /Y "plane-setup\docker-compose.override.yml" "..\plane-app\docker-compose.override.yml" >nul
echo   Aggiornato docker-compose.override.yml

echo.
echo ==========================================
echo   Avvio stack Plane...
echo ==========================================

cd /d "..\plane-app"

REM 4) Ferma eventuali container parziali precedenti
docker compose --env-file plane.env down 2>nul

REM 5) Avvia tutto lo stack
docker compose --env-file plane.env up -d
if errorlevel 1 (
    echo.
    echo ERRORE: docker compose up fallito.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   Stato container:
echo ==========================================
docker compose --env-file plane.env ps

echo.
echo ==========================================
echo   FATTO! Apri http://localhost
echo.
echo   Nota: la prima volta il migrator impiega
echo   1-2 minuti per inizializzare il database.
echo   Se non carica, attendi e ricarica la pagina.
echo ==========================================
pause
exit /b 0
