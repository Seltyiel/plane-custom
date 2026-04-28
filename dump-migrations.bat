@echo off
setlocal enableextensions

set OUT=%~dp0migrations-state.txt
cd /d "%USERPROFILE%\plane-app"

echo === Lista migration nel container api === > "%OUT%"
docker compose exec -T api ls /code/plane/db/migrations/ >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Showmigrations dal container === >> "%OUT%"
docker compose exec -T api python manage.py showmigrations db --plan >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Lista nel sorgente clonato (plane-build) === >> "%OUT%"
dir "%USERPROFILE%\plane-build\source\plane\apps\api\plane\db\migrations\" /B 2>&1 | findstr /B "01" >> "%OUT%"

echo Done. Scrivi "migrations dumpate".
pause
