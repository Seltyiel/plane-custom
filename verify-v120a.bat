@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica v1.20a (workspace-level states)
REM ===========================================================
REM
REM Lancia DOPO build.bat. Verifica che:
REM   1. Container api / plane-db / migrator esistano
REM   2. Migration 0122 applicata
REM   3. Schema 'states.project_id' ora NULLABLE
REM   4. Constraint nuovi presenti, vecchio rimosso
REM   5. Smoke test: crea e cancella uno workspace state via ORM
REM
REM Se uno step fallisce mostra il dettaglio.
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
if not exist "%PLANE_APP%\docker-compose.yml" (
    echo ERRORE: %PLANE_APP%\docker-compose.yml non trovato.
    pause
    exit /b 1
)
cd /d "%PLANE_APP%"

REM Estrae POSTGRES_PASSWORD da plane.env per i check via psql.
set DBPASS=plane
if exist "plane.env" (
    for /F "usebackq tokens=2 delims==" %%P in (`findstr /B /C:"POSTGRES_PASSWORD=" plane.env`) do set DBPASS=%%P
)

echo.
echo ============================================================
echo   plane-custom v1.20a - verify
echo ============================================================
echo.

set FAIL=

REM -------------------------------------------------------
REM 1. Container running (verifica via docker compose ps -a + findstr)
REM    Nota: migrator esce con Exited (0) dopo le migration: -a per includerlo.
REM    api e plane-db DEVONO essere Up. migrator basta che esista (anche stopped).
REM -------------------------------------------------------
echo [1/5] Container running...
docker compose ps -a > "%TEMP%\plane-ps.txt" 2>&1

findstr /C:"plane-app-api-1" "%TEMP%\plane-ps.txt" | findstr /C:"Up" >nul
if errorlevel 1 (
    echo     [FAIL] api non Up
    set FAIL=1
) else (
    echo     [OK]   api Up
)

findstr /C:"plane-app-plane-db-1" "%TEMP%\plane-ps.txt" | findstr /C:"Up" >nul
if errorlevel 1 (
    echo     [FAIL] plane-db non Up
    set FAIL=1
) else (
    echo     [OK]   plane-db Up
)

REM Migrator: se Exited (0), bene (migration completate).
REM            se Up,         bene (sta migrando ora).
REM            se Exited (1+), errore (migration fallita).
REM            se assente,    Plane non e' mai stato avviato col migrator.
findstr /C:"plane-app-migrator-1" "%TEMP%\plane-ps.txt" >nul
if errorlevel 1 (
    echo     [WARN] migrator container non trovato in ps -a.
    echo            Potrebbe essere stato rimosso. Verifico via showmigrations sotto.
) else (
    findstr /C:"plane-app-migrator-1" "%TEMP%\plane-ps.txt" | findstr /C:"Exited (0)" >nul
    if not errorlevel 1 (
        echo     [OK]   migrator Exited 0 ^(migration completate^)
    ) else (
        findstr /C:"plane-app-migrator-1" "%TEMP%\plane-ps.txt" | findstr /C:"Up" >nul
        if not errorlevel 1 (
            echo     [OK]   migrator Up ^(sta migrando ora^)
        ) else (
            echo     [WARN] migrator status atipico, controllo via showmigrations.
        )
    )
)

del /f /q "%TEMP%\plane-ps.txt" >nul 2>&1

if defined FAIL goto :err

REM -------------------------------------------------------
REM 2. Migration applicata (flat, niente nested if per evitare parser cmd)
REM -------------------------------------------------------
echo.
echo [2/5] Migration 0122 applicata...
docker compose exec -T api python manage.py showmigrations db --plan > "%TEMP%\plane-migr.txt" 2>&1

REM Estrae la riga della migration 0122 (se presente).
findstr /C:"0122_v120a_workspace_level_states" "%TEMP%\plane-migr.txt" > "%TEMP%\plane-migr-line.txt"

REM Se la riga non esiste, la migration non e' nemmeno nel plan.
for %%A in ("%TEMP%\plane-migr-line.txt") do set MIGR_LINE_SIZE=%%~zA
if "%MIGR_LINE_SIZE%"=="0" (
    echo     [FAIL] migration 0122 NON presente nel plan.
    echo     Probabilmente le immagini sono ancora pre-v1.20a. Lancia build.bat.
    echo     Plan attuale ^(righe 012x^):
    findstr /C:"db.012" "%TEMP%\plane-migr.txt"
    set FAIL=1
    del /f /q "%TEMP%\plane-migr.txt" >nul 2>&1
    del /f /q "%TEMP%\plane-migr-line.txt" >nul 2>&1
    goto :err
)

REM La riga esiste: cerca [X] per confermare che e' applicata.
findstr /C:"[X]" "%TEMP%\plane-migr-line.txt" >nul
if errorlevel 1 (
    echo     [FAIL] migration 0122 nel plan ma NON applicata.
    echo     Riga corrente:
    type "%TEMP%\plane-migr-line.txt"
    set FAIL=1
    del /f /q "%TEMP%\plane-migr.txt" >nul 2>&1
    del /f /q "%TEMP%\plane-migr-line.txt" >nul 2>&1
    goto :err
)

echo     [OK]   migration 0122 applicata
del /f /q "%TEMP%\plane-migr.txt" >nul 2>&1
del /f /q "%TEMP%\plane-migr-line.txt" >nul 2>&1

REM -------------------------------------------------------
REM 3. Schema state.project NULLABLE
REM -------------------------------------------------------
echo.
echo [3/5] Schema states.project NULLABLE...
docker compose exec -T -e PGPASSWORD=%DBPASS% plane-db psql -U plane -d plane -t -c "SELECT is_nullable FROM information_schema.columns WHERE table_name='states' AND column_name='project_id'" > "%TEMP%\plane-schema.txt" 2>&1
findstr /C:"YES" "%TEMP%\plane-schema.txt" >nul
if errorlevel 1 (
    echo     [FAIL] states.project_id NOT NULLABLE - migration potrebbe non essere applicata.
    type "%TEMP%\plane-schema.txt"
    set FAIL=1
    del /f /q "%TEMP%\plane-schema.txt" >nul 2>&1
    goto :err
)
echo     [OK]   states.project_id e' NULLABLE
del /f /q "%TEMP%\plane-schema.txt" >nul 2>&1

REM -------------------------------------------------------
REM 4. Constraint nuovi presenti
REM -------------------------------------------------------
echo.
echo [4/5] Constraint conditional unique...
docker compose exec -T -e PGPASSWORD=%DBPASS% plane-db psql -U plane -d plane -t -c "SELECT indexname FROM pg_indexes WHERE tablename='states' AND indexname LIKE 'state_unique%%'" > "%TEMP%\plane-idx.txt" 2>&1

findstr /C:"state_unique_name_project_when_active" "%TEMP%\plane-idx.txt" >nul
if errorlevel 1 (
    echo     [FAIL] indice state_unique_name_project_when_active MANCA
    set FAIL=1
) else (
    echo     [OK]   indice state_unique_name_project_when_active presente
)

findstr /C:"state_unique_name_workspace_shared_when_active" "%TEMP%\plane-idx.txt" >nul
if errorlevel 1 (
    echo     [FAIL] indice state_unique_name_workspace_shared_when_active MANCA
    set FAIL=1
) else (
    echo     [OK]   indice state_unique_name_workspace_shared_when_active presente
)

findstr /C:"state_unique_name_project_when_deleted_at_null" "%TEMP%\plane-idx.txt" >nul
if not errorlevel 1 (
    echo     [WARN] vecchio constraint state_unique_name_project_when_deleted_at_null ANCORA PRESENTE.
)

del /f /q "%TEMP%\plane-idx.txt" >nul 2>&1
if defined FAIL goto :err

REM -------------------------------------------------------
REM 5. Smoke test via Django ORM
REM -------------------------------------------------------
echo.
echo [5/5] Smoke test workspace state via Django ORM...
echo.

docker compose exec -T api python manage.py shell -c "from plane.db.models import State, Workspace; ws = Workspace.objects.first(); assert ws is not None, 'No workspace found'; s = State.objects.create(name='__verify_v120a_test__', color='#FF00FF', workspace=ws, project=None, group='backlog', sequence=99000); print('    CREATED state', s.id, 'on workspace', ws.slug); found = State.all_state_objects.filter(id=s.id, project__isnull=True).exists(); print('    VISIBLE via project__isnull=True:', found); s.delete(); print('    DELETED OK')"

if errorlevel 1 (
    echo.
    echo     [FAIL] smoke test fallito.
    set FAIL=1
    goto :err
)

REM -------------------------------------------------------
REM Tutto OK
REM -------------------------------------------------------
echo.
echo ============================================================
echo   v1.20a verify: TUTTO VERDE
echo ============================================================
echo.
echo Prossimi passi:
echo   - Lancia quick-commit.bat per il push.
echo   - Poi passiamo a v1.20b (API endpoints CRUD workspace states).
echo.
pause
exit /b 0

:err
echo.
echo ============================================================
echo   v1.20a verify: FALLITO
echo ============================================================
echo.
echo Diagnostica suggerita:
echo   docker compose logs migrator --tail=50
echo   docker compose exec plane-db psql -U plane -d plane -c "\d states"
echo.
echo Se la migration non e' applicata:
echo   docker compose up -d --no-deps migrator
echo   ^(aspetta che esca con Exited 0, poi rilancia questo verify^)
echo.
echo Se vuoi rollback alla 0121 ^(annulla v1.20a^):
echo   docker compose exec api python manage.py migrate db 0121
echo.
pause
exit /b 1
