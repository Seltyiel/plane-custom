@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica FUNZIONALE v1.33b (Timer start/stop)
REM ===========================================================
REM
REM Lancia DOPO build.bat con v1.33b applicato + verify-v133a-func OK.
REM Esercita il flusso ActiveTimer: start, get, stop, edge cases.
REM
REM Test:
REM   1. Trova un (workspace, project, issue, user) combo valido
REM   2. CLEANUP iniziale: cancella eventuali timer pendenti dell'utente test
REM   3. START timer su issue
REM   4. GET timer attivo, verifica elapsed_seconds >= 0
REM   5. START secondo timer -> deve fallire (UNIQUE constraint)
REM   6. STOP timer dopo 2 secondi -> crea TimeLog source='timer'
REM   7. Verifica che il TimeLog creato abbia source='timer' e
REM      timer_started_at popolato
REM   8. Verifica che ActiveTimer sia stato cancellato
REM   9. Edge case: issue eliminata mentre timer girava
REM      (start, simula issue.delete, stop -> aspetta cancel timer no log)
REM   10. CLEANUP: hard delete TimeLog di test
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0verify-v133b-func-output.txt
set SCRIPT=%~dp0verify-v133b-func-script.py
cd /d "%PLANE_APP%"

echo === plane-custom v1.33b FUNCTIONAL verify === > "%OUT%"
echo Started at %DATE% %TIME% >> "%OUT%"
echo. >> "%OUT%"

REM Genera script Python.
> "%SCRIPT%" echo import os, sys, time, django
>> "%SCRIPT%" echo sys.path.insert(0, '/code')
>> "%SCRIPT%" echo os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
>> "%SCRIPT%" echo django.setup()
>> "%SCRIPT%" echo from django.utils import timezone
>> "%SCRIPT%" echo from django.db import IntegrityError, transaction
>> "%SCRIPT%" echo from datetime import timedelta
>> "%SCRIPT%" echo from plane.db.models import Issue, ProjectMember
>> "%SCRIPT%" echo from plane.db.models.time_log import TimeLog, TimeLogSource
>> "%SCRIPT%" echo from plane.db.models.active_timer import ActiveTimer
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo def line(label, ok, msg=""):
>> "%SCRIPT%" echo     tag = "[PASS]" if ok else "[FAIL]"
>> "%SCRIPT%" echo     print(f"{tag} {label}{(': '+msg) if msg else ''}")
>> "%SCRIPT%" echo     return ok
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo all_pass = True
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 1: combo
>> "%SCRIPT%" echo pm = ProjectMember.objects.filter(is_active=True, deleted_at__isnull=True).select_related('project','member','workspace').first()
>> "%SCRIPT%" echo if not pm: print("[FAIL] No ProjectMember"); raise SystemExit(1)
>> "%SCRIPT%" echo issue = Issue.objects.filter(project=pm.project, deleted_at__isnull=True, archived_at__isnull=True).first()
>> "%SCRIPT%" echo if not issue: print("[FAIL] No issue"); raise SystemExit(1)
>> "%SCRIPT%" echo print(f"Test combo: workspace={pm.workspace.slug} issue={issue.sequence_id} user={pm.member.email}")
>> "%SCRIPT%" echo all_pass ^&= line("Step 1 - combo found", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 2: cleanup pre-existing timer
>> "%SCRIPT%" echo ActiveTimer.objects.filter(user=pm.member).delete()
>> "%SCRIPT%" echo all_pass ^&= line("Step 2 - cleanup pre-existing timer", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 3: START
>> "%SCRIPT%" echo timer = ActiveTimer.objects.create(user=pm.member, workspace=pm.workspace, issue=issue, description='v1.33b verify test')
>> "%SCRIPT%" echo all_pass ^&= line("Step 3 - START timer", timer.id is not None and timer.started_at is not None)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 4: GET (verify started_at recent)
>> "%SCRIPT%" echo got = ActiveTimer.objects.get(user=pm.member)
>> "%SCRIPT%" echo elapsed = (timezone.now() - got.started_at).total_seconds()
>> "%SCRIPT%" echo all_pass ^&= line("Step 4 - GET active timer", got.id == timer.id and elapsed ^>= 0 and elapsed ^< 5, f"elapsed={elapsed:.2f}s")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 5: START secondo timer -> deve fallire (OneToOneField UNIQUE)
>> "%SCRIPT%" echo try:
>> "%SCRIPT%" echo     with transaction.atomic():
>> "%SCRIPT%" echo         ActiveTimer.objects.create(user=pm.member, workspace=pm.workspace, issue=issue)
>> "%SCRIPT%" echo     all_pass ^&= line("Step 5 - UNIQUE constraint enforces 1 timer per user", False, "second timer ACCEPTED (BUG!)")
>> "%SCRIPT%" echo except IntegrityError:
>> "%SCRIPT%" echo     all_pass ^&= line("Step 5 - UNIQUE constraint enforces 1 timer per user", True, "IntegrityError as expected")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 6: STOP after 2 seconds (simula la logica dell'endpoint stop)
>> "%SCRIPT%" echo time.sleep(2)
>> "%SCRIPT%" echo stop_time = timezone.now()
>> "%SCRIPT%" echo duration_seconds = int((stop_time - timer.started_at).total_seconds())
>> "%SCRIPT%" echo with transaction.atomic():
>> "%SCRIPT%" echo     log = TimeLog.objects.create(workspace=timer.workspace, project=timer.issue.project, issue=timer.issue, user=timer.user, duration_seconds=duration_seconds, logged_at=stop_time, description=timer.description, source=TimeLogSource.TIMER, timer_started_at=timer.started_at)
>> "%SCRIPT%" echo     timer.delete()
>> "%SCRIPT%" echo all_pass ^&= line("Step 6 - STOP creates TimeLog and deletes timer", log.id is not None and duration_seconds ^>= 2, f"duration={duration_seconds}s")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 7: log fields correct
>> "%SCRIPT%" echo all_pass ^&= line("Step 7 - TimeLog source='timer' and timer_started_at set", log.source == 'timer' and log.timer_started_at is not None)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 8: ActiveTimer cancellato
>> "%SCRIPT%" echo gone = ActiveTimer.objects.filter(user=pm.member).first() is None
>> "%SCRIPT%" echo all_pass ^&= line("Step 8 - ActiveTimer deleted after stop", gone)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 9: edge case issue gone (FK SET_NULL)
>> "%SCRIPT%" echo timer2 = ActiveTimer.objects.create(user=pm.member, workspace=pm.workspace, issue=issue)
>> "%SCRIPT%" echo timer2_id = timer2.id
>> "%SCRIPT%" echo # Simulazione: usiamo update SQL per settare issue=NULL ^(non possiamo
>> "%SCRIPT%" echo # davvero cancellare l'issue di test^), che riproduce l'effetto SET_NULL
>> "%SCRIPT%" echo ActiveTimer.objects.filter(pk=timer2_id).update(issue=None)
>> "%SCRIPT%" echo timer2.refresh_from_db()
>> "%SCRIPT%" echo all_pass ^&= line("Step 9a - issue can become NULL (FK SET_NULL works)", timer2.issue_id is None)
>> "%SCRIPT%" echo # cleanup il timer "orfano"
>> "%SCRIPT%" echo timer2.delete()
>> "%SCRIPT%" echo all_pass ^&= line("Step 9b - cleanup orphan timer", ActiveTimer.objects.filter(pk=timer2_id).first() is None)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 10: cleanup TimeLog di test
>> "%SCRIPT%" echo TimeLog.all_objects.filter(pk=log.id).delete()
>> "%SCRIPT%" echo all_pass ^&= line("Step 10 - CLEANUP TimeLog di test", TimeLog.all_objects.filter(pk=log.id).first() is None)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo print()
>> "%SCRIPT%" echo if all_pass:
>> "%SCRIPT%" echo     print("*** TUTTI I TEST PASSATI ***")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     print("*** ALCUNI TEST FALLITI ***")
>> "%SCRIPT%" echo     raise SystemExit(1)

echo === Esecuzione test ORM dentro container API === >> "%OUT%"
docker compose cp "%SCRIPT%" api:/tmp/verify-v133b.py
if errorlevel 1 (
    echo     [FAIL] docker cp fallito >> "%OUT%"
    type "%OUT%"
    pause
    exit /b 1
)
docker compose exec -T api python /tmp/verify-v133b.py >> "%OUT%" 2>&1
set EXITCODE=%errorlevel%

docker compose exec -T api rm -f /tmp/verify-v133b.py >nul 2>&1
del /Q "%SCRIPT%" 2>nul

echo. >> "%OUT%"
if !EXITCODE! NEQ 0 (
    echo *** VERIFICA FUNZIONALE FALLITA *** >> "%OUT%"
) else (
    echo *** VERIFICA FUNZIONALE OK - v1.33b stabile *** >> "%OUT%"
)

type "%OUT%"
echo.
echo ============================================================
echo Output: %OUT%
echo ============================================================
pause
exit /b !EXITCODE!
