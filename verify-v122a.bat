@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica v1.22a (workspace project fittizio)
REM ===========================================================
REM
REM Lancia DOPO build.bat con v1.22a. Verifica che:
REM   1. Migration 0123 applicata
REM   2. Project.is_hidden field presente nello schema
REM   3. Endpoint GET /workspace-project/ funziona (smoke test via curl)
REM   4. Il progetto fittizio creato ha is_hidden=true e i 6 default state
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0verify-v122a-output.txt
cd /d "%PLANE_APP%"

REM Estrae POSTGRES_PASSWORD per psql.
set DBPASS=plane
if exist "plane.env" (
    for /F "usebackq tokens=2 delims==" %%P in (`findstr /B /C:"POSTGRES_PASSWORD=" plane.env`) do set DBPASS=%%P
)

echo === [1/4] Migration 0123 applicata === > "%OUT%"
docker compose exec -T api python manage.py showmigrations db --plan > "%TEMP%\plane-migr.txt" 2>&1
findstr /C:"0123_v122a_project_is_hidden" "%TEMP%\plane-migr.txt" > "%TEMP%\plane-migr-line.txt"
for %%A in ("%TEMP%\plane-migr-line.txt") do set MIGR_SIZE=%%~zA
if "!MIGR_SIZE!"=="0" (
    echo     [FAIL] migration 0123 NON presente. Hai lanciato build.bat? >> "%OUT%"
    goto :end
)
findstr /C:"[X]" "%TEMP%\plane-migr-line.txt" >nul
if errorlevel 1 (
    echo     [FAIL] migration 0123 non applicata. >> "%OUT%"
    goto :end
)
echo     [OK]   migration 0123 applicata >> "%OUT%"

echo. >> "%OUT%"
echo === [2/4] Schema projects.is_hidden presente === >> "%OUT%"
docker compose exec -T -e PGPASSWORD=%DBPASS% plane-db psql -U plane -d plane -t -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='projects' AND column_name='is_hidden'" > "%TEMP%\plane-schema.txt" 2>&1
findstr /C:"is_hidden" "%TEMP%\plane-schema.txt" >nul
if errorlevel 1 (
    echo     [FAIL] colonna is_hidden NON presente in projects. >> "%OUT%"
    type "%TEMP%\plane-schema.txt" >> "%OUT%"
    goto :end
)
echo     [OK]   colonna projects.is_hidden presente >> "%OUT%"
type "%TEMP%\plane-schema.txt" >> "%OUT%"

echo. >> "%OUT%"
echo === [3/4] Smoke test endpoint via Django shell === >> "%OUT%"
docker compose exec -T api python manage.py shell -c "from plane.db.models import Workspace, Project, ProjectMember, WorkspaceMember; ws = Workspace.objects.first(); print('  workspace=', ws.slug); from rest_framework.test import APIRequestFactory; from plane.app.views.workspace.workspace_project import WorkspaceProjectEndpoint; factory = APIRequestFactory(); user = WorkspaceMember.objects.filter(workspace=ws, is_active=True).first().member; req = factory.get(f'/api/workspaces/{ws.slug}/workspace-project/'); req.user = user; resp = WorkspaceProjectEndpoint.as_view()(req, slug=ws.slug); print('  status=', resp.status_code); print('  data=', resp.data); p = Project.objects.filter(workspace=ws, is_hidden=True).first(); print('  Project found:', p.name, p.identifier, 'states=', p.project_state.count() if p else 'n/a', 'members=', ProjectMember.objects.filter(project=p, is_active=True).count() if p else 'n/a')" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === [4/4] Tutto OK se status=200 + Project found con states 6 (o piu) e members > 0 === >> "%OUT%"

:end
echo. >> "%OUT%"
echo Output salvato in %OUT%
type "%OUT%"
echo.
echo Manda il file a Claude o copia il testo.
pause
