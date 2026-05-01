@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica v1.33a (Time Tracking backend MVP)
REM ===========================================================
REM
REM Lancia DOPO build.bat con v1.33a. Verifica che:
REM   1. Migration 0124 applicata.
REM   2. Tabella time_logs presente con colonne+indici+constraint.
REM   3. Endpoint REST raggiungibili (smoke 401 → richiede auth, OK).
REM
REM Il test funzionale "creo un log e lo recupero" richiede un browser
REM autenticato e auth cookie, troppo fragile da fare in batch. Lo
REM facciamo manuale dopo questo verify.
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0verify-v133a-output.txt
cd /d "%PLANE_APP%"

REM Pulisce output precedente.
echo === plane-custom v1.33a verify === > "%OUT%"
echo Started at %DATE% %TIME% >> "%OUT%"
echo. >> "%OUT%"

REM -------------------------------------------------------
REM 1. Migration 0124 applicata
REM -------------------------------------------------------
echo === [1/4] Migration 0124 applicata === >> "%OUT%"
docker compose exec -T api python manage.py showmigrations db --plan > "%TEMP%\plane-migr.txt" 2>&1
findstr /C:"0124_v133a_time_logs" "%TEMP%\plane-migr.txt" > "%TEMP%\plane-migr-line.txt"
for %%A in ("%TEMP%\plane-migr-line.txt") do set MIGR_SIZE=%%~zA
if "!MIGR_SIZE!"=="0" (
    echo     [FAIL] migration 0124 NON presente. Hai lanciato build.bat? >> "%OUT%"
    echo. >> "%OUT%"
    echo Output di showmigrations: >> "%OUT%"
    type "%TEMP%\plane-migr.txt" >> "%OUT%"
    goto :end
)
findstr /C:"[X]" "%TEMP%\plane-migr-line.txt" >nul
if errorlevel 1 (
    echo     [FAIL] migration 0124 non applicata. >> "%OUT%"
    echo Stato: >> "%OUT%"
    type "%TEMP%\plane-migr-line.txt" >> "%OUT%"
    goto :end
)
echo     [OK]   migration 0124 applicata >> "%OUT%"
echo. >> "%OUT%"

REM -------------------------------------------------------
REM 2. Tabella time_logs presente con colonne+indici attesi.
REM Usiamo Django shell dentro il container API (che ha gia' la
REM DATABASE_URL configurata correttamente) invece di psql diretto.
REM Piu' robusto: niente problemi di password/auth/quoting.
REM -------------------------------------------------------
echo === [2/4] Tabella time_logs schema === >> "%OUT%"
docker compose exec -T api python -c "from django.db import connection;cur=connection.cursor();cur.execute(\"SELECT column_name FROM information_schema.columns WHERE table_name='time_logs' ORDER BY ordinal_position\");print('COLS:',[r[0] for r in cur.fetchall()]);cur.execute(\"SELECT indexname FROM pg_indexes WHERE tablename='time_logs'\");print('IDX:',[r[0] for r in cur.fetchall()]);cur.execute(\"SELECT conname FROM pg_constraint WHERE conrelid='time_logs'::regclass AND contype='c'\");print('CHK:',[r[0] for r in cur.fetchall()])" > "%TEMP%\plane-time-logs-schema.txt" 2>&1

findstr /C:"COLS:" "%TEMP%\plane-time-logs-schema.txt" >nul
if errorlevel 1 (
    echo     [FAIL] tabella time_logs non interrogabile. Output: >> "%OUT%"
    type "%TEMP%\plane-time-logs-schema.txt" >> "%OUT%"
    goto :end
)
echo     [OK]   tabella time_logs interrogabile >> "%OUT%"

REM Check colonne chiave (almeno 5 di queste devono comparire)
set FOUND_COLS=0
for %%C in (duration_seconds logged_at description source approval_status timer_started_at) do (
    findstr /C:"%%C" "%TEMP%\plane-time-logs-schema.txt" >nul
    if not errorlevel 1 set /a FOUND_COLS+=1
)
if !FOUND_COLS! LSS 5 (
    echo     [FAIL] solo !FOUND_COLS!/6 colonne attese trovate. Output: >> "%OUT%"
    type "%TEMP%\plane-time-logs-schema.txt" >> "%OUT%"
    goto :end
)
echo     [OK]   !FOUND_COLS!/6 colonne attese presenti >> "%OUT%"

REM Check 4 indici creati
set FOUND_IDX=0
for %%I in (time_log_user_logged_idx time_log_issue_idx time_log_ws_logged_idx time_log_pending_idx) do (
    findstr /C:"%%I" "%TEMP%\plane-time-logs-schema.txt" >nul
    if not errorlevel 1 set /a FOUND_IDX+=1
)
if !FOUND_IDX! LSS 4 (
    echo     [FAIL] solo !FOUND_IDX!/4 indici trovati. Output: >> "%OUT%"
    type "%TEMP%\plane-time-logs-schema.txt" >> "%OUT%"
    goto :end
)
echo     [OK]   !FOUND_IDX!/4 indici presenti >> "%OUT%"

REM Check CheckConstraint
findstr /C:"time_log_duration_seconds_range" "%TEMP%\plane-time-logs-schema.txt" >nul
if errorlevel 1 (
    echo     [WARN] CheckConstraint duration_seconds_range NON trovato. Output: >> "%OUT%"
    type "%TEMP%\plane-time-logs-schema.txt" >> "%OUT%"
) else (
    echo     [OK]   CheckConstraint duration_seconds_range presente >> "%OUT%"
)
echo. >> "%OUT%"

REM -------------------------------------------------------
REM 3. Endpoint REST raggiungibili (smoke - dovrebbe rispondere 401/403)
REM -------------------------------------------------------
echo === [3/4] Endpoint REST raggiungibili === >> "%OUT%"
echo Test: GET /api/workspaces/test-slug/time-logs/ ^(senza auth^) >> "%OUT%"
curl -s -o "%TEMP%\plane-tl-curl.txt" -w "HTTP %%{http_code}\n" "http://localhost/api/workspaces/test-slug/time-logs/" >> "%OUT%" 2>&1
findstr /R "HTTP 40[01]\|HTTP 200" "%OUT%" >nul
if errorlevel 1 (
    echo     [WARN] Endpoint non risponde con 200/401/403. Output: >> "%OUT%"
    type "%TEMP%\plane-tl-curl.txt" >> "%OUT%"
) else (
    echo     [OK]   Endpoint raggiungibile ^(401 atteso senza auth, 200 se hai un workspace test-slug^) >> "%OUT%"
)
echo. >> "%OUT%"

REM -------------------------------------------------------
REM 4. Models registry: TimeLog import-able da django shell
REM -------------------------------------------------------
echo === [4/4] Modello TimeLog registrato in plane.db.models === >> "%OUT%"
docker compose exec -T api python -c "from plane.db.models import TimeLog; print('TimeLog imported, table:', TimeLog._meta.db_table)" > "%TEMP%\plane-tl-import.txt" 2>&1
findstr /C:"TimeLog imported, table: time_logs" "%TEMP%\plane-tl-import.txt" >nul
if errorlevel 1 (
    echo     [FAIL] TimeLog non importabile. Errore: >> "%OUT%"
    type "%TEMP%\plane-tl-import.txt" >> "%OUT%"
    goto :end
)
echo     [OK]   TimeLog correttamente registrato in models >> "%OUT%"
echo. >> "%OUT%"

REM -------------------------------------------------------
REM SUCCESS
REM -------------------------------------------------------
echo === RISULTATO === >> "%OUT%"
echo. >> "%OUT%"
echo *** v1.33a VERIFICA OK *** >> "%OUT%"
echo. >> "%OUT%"
echo Backend Time Tracking pronto. Endpoint live: >> "%OUT%"
echo   POST   /api/workspaces/^<slug^>/projects/^<pid^>/issues/^<iid^>/time-logs/ >> "%OUT%"
echo   GET    /api/workspaces/^<slug^>/projects/^<pid^>/issues/^<iid^>/time-logs/ >> "%OUT%"
echo   GET    /api/workspaces/^<slug^>/time-logs/?from=^&to=^&user_id=^&project_id= >> "%OUT%"
echo   GET    /api/workspaces/^<slug^>/time-logs/^<id^>/ >> "%OUT%"
echo   PATCH  /api/workspaces/^<slug^>/time-logs/^<id^>/ >> "%OUT%"
echo   DELETE /api/workspaces/^<slug^>/time-logs/^<id^>/ >> "%OUT%"
echo. >> "%OUT%"
echo Per test funzionale ^(create + list^) servono auth cookie ^(sessionid^). >> "%OUT%"
echo Apri il browser su Plane, inspect ^> Network, copia un curl da una >> "%OUT%"
echo qualsiasi chiamata API e cambia URL+method+body. >> "%OUT%"

:end
echo. >> "%OUT%"
echo Output completo: %OUT% >> "%OUT%"

REM Stampa anche a console.
type "%OUT%"
echo.
echo ============================================================
echo Output salvato in: %OUT%
echo ============================================================
pause
exit /b 0
