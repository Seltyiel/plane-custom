@echo off
setlocal enableextensions
set OUT=%~dp0project-list-values.txt
cd /d "%USERPROFILE%\plane-app"

echo === project/base.py linee .values() in container api === > "%OUT%"
docker compose exec -T api grep -n -A 30 "def list" /code/plane/app/views/project/base.py >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Cerco 'is_hidden' nel file base.py del container === >> "%OUT%"
docker compose exec -T api grep -n "is_hidden" /code/plane/app/views/project/base.py >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Image attuale di api === >> "%OUT%"
docker compose images api >> "%OUT%" 2>&1

pause
