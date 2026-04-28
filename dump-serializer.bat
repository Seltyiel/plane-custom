@echo off
setlocal enableextensions

REM Dump del file serializers/issue.py dentro il container API per
REM verificare se il fix v1.20 hotfix #2 e' stato applicato.

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0container-serializer.txt

cd /d "%PLANE_APP%"

echo Dumping serializer file inside the api container... > "%OUT%"
echo. >> "%OUT%"
echo === SEARCH for "State is not valid" in container === >> "%OUT%"
docker compose exec -T api grep -n -A 8 "State is not valid" /code/plane/app/serializers/issue.py >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === SEARCH for Q import in container === >> "%OUT%"
docker compose exec -T api grep -n "from django.db.models import" /code/plane/app/serializers/issue.py >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === SEARCH for hotfix marker === >> "%OUT%"
docker compose exec -T api grep -n "v1.20 hotfix" /code/plane/app/serializers/issue.py /code/plane/api/serializers/issue.py /code/plane/app/serializers/draft.py >> "%OUT%" 2>&1
echo. >> "%OUT%"

echo Done. File: %OUT%
echo Adesso scrivi a Claude "serializer dumpato".
pause
exit /b 0
