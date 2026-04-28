@echo off
setlocal enableextensions

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0issue-patch-flow.txt

cd /d "%PLANE_APP%"

echo === IssueViewSet.partial_update ^(60 righe da line 615^) === > "%OUT%"
docker compose exec -T api sed -n "610,680p" /code/plane/app/views/issue/base.py >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Cerco IssueCreateSerializer / IssueDetailSerializer in views/issue ^(quale serializer usato per partial_update^) === >> "%OUT%"
docker compose exec -T api grep -n "IssueSerializer\|IssueCreateSerializer\|serializer_class\|context=" /code/plane/app/views/issue/base.py >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Linee 130-200 di issue.py ^(IssueCreateSerializer.validate^) === >> "%OUT%"
docker compose exec -T api sed -n "130,200p" /code/plane/app/serializers/issue.py >> "%OUT%" 2>&1

pause
