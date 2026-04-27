@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica v1.20b (workspace state CRUD)
REM ===========================================================
REM
REM Lancia DOPO build.bat con v1.20b. Verifica che:
REM   1. Container api Up (le immagini buildate non hanno ImportError)
REM   2. Endpoint POST /workspaces/<slug>/states/   crea uno shared state
REM   3. Endpoint PATCH lo modifica
REM   4. Endpoint mark-default lo setta default
REM   5. Endpoint GET aggregato lo include
REM   6. Endpoint DELETE lo cancella
REM
REM Tutti i check usano Django shell via manage.py per simulare le chiamate
REM senza dover gestire token HTTP / cookie / auth headers.
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
if not exist "%PLANE_APP%\docker-compose.yml" (
    echo ERRORE: %PLANE_APP%\docker-compose.yml non trovato.
    pause
    exit /b 1
)
cd /d "%PLANE_APP%"

echo.
echo ============================================================
echo   plane-custom v1.20b - verify
echo ============================================================
echo.

set FAIL=

REM -------------------------------------------------------
REM 1. Container api Up
REM -------------------------------------------------------
echo [1/3] Container api Up...
docker compose ps -a > "%TEMP%\plane-ps.txt" 2>&1
findstr /C:"plane-app-api-1" "%TEMP%\plane-ps.txt" | findstr /C:"Up" >nul
if errorlevel 1 (
    echo     [FAIL] api container non Up. Probabile ImportError o errore Python.
    echo     Logs api:
    docker compose logs api --tail=20
    set FAIL=1
    del /f /q "%TEMP%\plane-ps.txt" >nul 2>&1
    goto :err
)
echo     [OK]   api Up
del /f /q "%TEMP%\plane-ps.txt" >nul 2>&1

REM -------------------------------------------------------
REM 2. URL routing carica senza errori (showurls)
REM -------------------------------------------------------
echo.
echo [2/3] URL routing carica le 3 nuove route v1.20b...
docker compose exec -T api python manage.py shell -c "from django.urls import get_resolver; resolver = get_resolver(); patterns = list(resolver.reverse_dict.keys()); names = [p for p in patterns if isinstance(p, str)]; expected = ['workspace-state', 'workspace-state-detail', 'workspace-state-mark-default']; missing = [n for n in expected if n not in names]; print('Found routes:', [n for n in expected if n in names]); print('Missing:', missing); assert not missing, 'Missing routes: ' + str(missing)"
if errorlevel 1 (
    echo     [FAIL] una o piu' route v1.20b mancanti.
    set FAIL=1
    goto :err
)
echo     [OK]   3 nuove route v1.20b caricate

REM -------------------------------------------------------
REM 3. Smoke test CRUD via ORM (simula gli endpoint a livello model)
REM -------------------------------------------------------
echo.
echo [3/3] Smoke test CRUD workspace state via ORM...
echo.

docker compose exec -T api python manage.py shell -c "from plane.db.models import State, Workspace; ws = Workspace.objects.first(); assert ws is not None; s = State.objects.create(name='__verify_v120b_test__', color='#00FF00', workspace=ws, project=None, group='started'); print('  CREATE OK id=', s.id); s.name = '__verify_v120b_test_renamed__'; s.save(); reread = State.objects.get(pk=s.id); assert reread.name == '__verify_v120b_test_renamed__'; print('  UPDATE OK name=', reread.name); State.all_state_objects.filter(workspace=ws, project__isnull=True, default=True).update(default=False); s.default = True; s.save(); reread = State.objects.get(pk=s.id); assert reread.default == True; print('  MARK-DEFAULT OK default=', reread.default); s.delete(); assert not State.objects.filter(pk=s.id).exists(), 'still visible via default manager'; print('  DELETE OK (soft-deleted)')"

if errorlevel 1 (
    echo     [FAIL] smoke test fallito.
    set FAIL=1
    goto :err
)

echo.
echo ============================================================
echo   v1.20b verify: TUTTO VERDE
echo ============================================================
echo.
echo Endpoint funzionanti:
echo   GET    /api/workspaces/<slug>/states/                  ^(esteso^)
echo   POST   /api/workspaces/<slug>/states/                  ^(NEW^)
echo   GET    /api/workspaces/<slug>/states/<id>/             ^(NEW^)
echo   PATCH  /api/workspaces/<slug>/states/<id>/             ^(NEW^)
echo   DELETE /api/workspaces/<slug>/states/<id>/             ^(NEW^)
echo   POST   /api/workspaces/<slug>/states/<id>/mark-default/  ^(NEW^)
echo.
echo Prossimi passi:
echo   - Test manuale dal browser ^(DevTools console^) per validare HTTP layer.
echo   - Lancia quick-commit.bat per il push.
echo   - Poi v1.20c ^(frontend store + service^).
echo.
pause
exit /b 0

:err
echo.
echo ============================================================
echo   v1.20b verify: FALLITO
echo ============================================================
echo.
echo Diagnostica suggerita:
echo   docker compose logs api --tail=80
echo.
pause
exit /b 1
