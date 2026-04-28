@echo off
setlocal enableextensions

REM ===========================================================
REM   plane-custom - Dump dei log API in un file leggibile
REM ===========================================================
REM
REM Lancialo quando ti chiedo di vedere i log dei container.
REM Dumpa gli ultimi 200 log dell'API in C:\Users\acamp\plane-custom\api-logs.txt
REM cosi' io posso leggerli direttamente dal sandbox.
REM
REM Aggiunge anche i log del migrator (utile per migration errors) e
REM gli ultimi 50 del proxy.
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0api-logs.txt

if not exist "%PLANE_APP%\docker-compose.yml" (
    echo ERRORE: %PLANE_APP%\docker-compose.yml non trovato.
    pause
    exit /b 1
)

cd /d "%PLANE_APP%"

echo Dumping logs to %OUT%...
echo =========================================================== > "%OUT%"
echo   plane-custom logs dump - %DATE% %TIME% >> "%OUT%"
echo =========================================================== >> "%OUT%"
echo. >> "%OUT%"

echo === docker compose ps === >> "%OUT%"
docker compose ps -a >> "%OUT%" 2>&1
echo. >> "%OUT%"

echo === api logs ^(last 200 lines^) === >> "%OUT%"
docker compose logs api --tail=200 >> "%OUT%" 2>&1
echo. >> "%OUT%"

echo === worker logs ^(last 50 lines^) === >> "%OUT%"
docker compose logs worker --tail=50 >> "%OUT%" 2>&1
echo. >> "%OUT%"

echo === migrator logs ^(last 30 lines^) === >> "%OUT%"
docker compose logs migrator --tail=30 >> "%OUT%" 2>&1
echo. >> "%OUT%"

echo === proxy logs ^(last 30 lines^) === >> "%OUT%"
docker compose logs proxy --tail=30 >> "%OUT%" 2>&1
echo. >> "%OUT%"

echo OK. File scritto: %OUT%
echo Dimensione:
dir /B "%OUT%"
for %%I in ("%OUT%") do echo   %%~zI bytes
echo.
echo Adesso scrivi a Claude "log dumpati" e leggera' il file.
pause
exit /b 0
