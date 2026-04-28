@echo off
setlocal enableextensions

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0state-validations.txt

cd /d "%PLANE_APP%"

echo === Tutti i punti "State is not valid" nel backend === > "%OUT%"
docker compose exec -T api grep -rln "State is not valid" /code/plane >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Verifica state_manager.filter ^(escluso quanto gia' patchato^) === >> "%OUT%"
docker compose exec -T api grep -rn "state_manager.filter\|State.objects.filter.*project_id" /code/plane/app /code/plane/api >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Validate methods nel issue serializer ^(file gia' patchato^) === >> "%OUT%"
docker compose exec -T api grep -n "def validate" /code/plane/app/serializers/issue.py >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === IssueViewSet partial_update ===  >> "%OUT%"
docker compose exec -T api grep -n -B 1 "def partial_update" /code/plane/app/views/issue/base.py >> "%OUT%" 2>&1

echo Done. Scrivi "validations dumpate".
pause
