@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica FUNZIONALE v1.33a (Time Tracking)
REM ===========================================================
REM
REM Lancia DOPO build.bat con v1.33a + verify-v133a.bat OK.
REM Esercita il flusso CRUD reale via Django ORM dentro il container API.
REM Test sequenziali:
REM   1. Trova un (workspace, project, issue, user) combo valido
REM   2. CREATE: TimeLog di 1h (3600s) con source='manual', auto-approved
REM   3. READ: rileggi via .objects.get()
REM   4. CHECK: serializer to_representation include user_display_name
REM   5. UPDATE: duration_seconds 3600 -> 5400
REM   6. CONSTRAINT: tenta duration_seconds = -1, deve fallire IntegrityError
REM   7. SOFT DELETE: .delete() -> deleted_at popolato
REM   8. CLEANUP: hard delete del log di test, e' verifica
REM
REM Ogni test stampa [PASS]/[FAIL]. Output salvato in
REM verify-v133a-func-output.txt.
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0verify-v133a-func-output.txt
set SCRIPT=%~dp0verify-v133a-func-script.py
cd /d "%PLANE_APP%"

echo === plane-custom v1.33a FUNCTIONAL verify === > "%OUT%"
echo Started at %DATE% %TIME% >> "%OUT%"
echo. >> "%OUT%"

REM Genera lo script Python che gira dentro il container API.
REM Lo creo on-the-fly per evitare problemi di line-ending Windows/Linux.
REM
REM Boilerplate Django setup: serve per import standalone (non via manage.py).
> "%SCRIPT%" echo import os, sys, django
>> "%SCRIPT%" echo sys.path.insert(0, '/code')
>> "%SCRIPT%" echo os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
>> "%SCRIPT%" echo django.setup()
>> "%SCRIPT%" echo from django.db import IntegrityError, transaction
>> "%SCRIPT%" echo from django.utils import timezone
>> "%SCRIPT%" echo from plane.db.models import Workspace, Project, Issue, ProjectMember, User
>> "%SCRIPT%" echo from plane.db.models.time_log import TimeLog, TimeLogSource, TimeLogApprovalStatus
>> "%SCRIPT%" echo from plane.app.serializers.time_log import TimeLogSerializer
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo def line(label, ok, msg=""):
>> "%SCRIPT%" echo     tag = "[PASS]" if ok else "[FAIL]"
>> "%SCRIPT%" echo     print(f"{tag} {label}{(': '+msg) if msg else ''}")
>> "%SCRIPT%" echo     return ok
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo all_pass = True
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 1: trova combo valido
>> "%SCRIPT%" echo pm = ProjectMember.objects.filter(is_active=True, deleted_at__isnull=True).select_related('project','member','workspace').first()
>> "%SCRIPT%" echo if not pm:
>> "%SCRIPT%" echo     print("[FAIL] No active ProjectMember found - non posso testare. Crea almeno un workspace + project + member.")
>> "%SCRIPT%" echo     raise SystemExit(1)
>> "%SCRIPT%" echo issue = Issue.objects.filter(project=pm.project, deleted_at__isnull=True, archived_at__isnull=True).first()
>> "%SCRIPT%" echo if not issue:
>> "%SCRIPT%" echo     print(f"[FAIL] Project {pm.project.name} non ha issue, ne creo uno per il test.")
>> "%SCRIPT%" echo     raise SystemExit(1)
>> "%SCRIPT%" echo print(f"Test combo: workspace={pm.workspace.slug} project={pm.project.identifier} issue={issue.sequence_id} user={pm.member.email}")
>> "%SCRIPT%" echo all_pass ^&= line("Step 1 - combo (ws/project/issue/user) found", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 2: CREATE
>> "%SCRIPT%" echo log = TimeLog.objects.create(
>> "%SCRIPT%" echo     workspace=pm.workspace, project=pm.project, issue=issue, user=pm.member,
>> "%SCRIPT%" echo     duration_seconds=3600, logged_at=timezone.now(),
>> "%SCRIPT%" echo     description="v1.33a verify test - safe to delete",
>> "%SCRIPT%" echo     source=TimeLogSource.MANUAL, approval_status=TimeLogApprovalStatus.AUTO,
>> "%SCRIPT%" echo )
>> "%SCRIPT%" echo all_pass ^&= line("Step 2 - CREATE TimeLog (3600s)", log.id is not None, f"id={log.id}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 3: READ
>> "%SCRIPT%" echo got = TimeLog.objects.get(pk=log.id)
>> "%SCRIPT%" echo all_pass ^&= line("Step 3 - READ via .objects.get()", got.duration_seconds == 3600 and got.source == 'manual')
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 4: SERIALIZER includes annotated fields
>> "%SCRIPT%" echo data = TimeLogSerializer(got).data
>> "%SCRIPT%" echo expected_keys = {'id','duration_seconds','user_display_name','user_avatar_url','issue_name','issue_sequence_id','project_identifier','approval_status'}
>> "%SCRIPT%" echo missing = expected_keys - set(data.keys())
>> "%SCRIPT%" echo all_pass ^&= line("Step 4 - SERIALIZER includes annotated fields", not missing, f"missing={missing}" if missing else "all keys present")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 5: UPDATE
>> "%SCRIPT%" echo got.duration_seconds = 5400
>> "%SCRIPT%" echo got.save()
>> "%SCRIPT%" echo refetched = TimeLog.objects.get(pk=log.id)
>> "%SCRIPT%" echo all_pass ^&= line("Step 5 - UPDATE duration 3600 -^> 5400", refetched.duration_seconds == 5400)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 6: CHECK CONSTRAINT (negative duration must fail)
>> "%SCRIPT%" echo try:
>> "%SCRIPT%" echo     with transaction.atomic():
>> "%SCRIPT%" echo         TimeLog.objects.create(
>> "%SCRIPT%" echo             workspace=pm.workspace, project=pm.project, issue=issue, user=pm.member,
>> "%SCRIPT%" echo             duration_seconds=-1, logged_at=timezone.now(),
>> "%SCRIPT%" echo         )
>> "%SCRIPT%" echo     all_pass ^&= line("Step 6 - CHECK CONSTRAINT rejects duration=-1", False, "ACCEPTED -1 (BUG!)")
>> "%SCRIPT%" echo except IntegrityError as e:
>> "%SCRIPT%" echo     all_pass ^&= line("Step 6 - CHECK CONSTRAINT rejects duration=-1", True, "IntegrityError as expected")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 7: SOFT DELETE
>> "%SCRIPT%" echo got.delete()
>> "%SCRIPT%" echo soft_deleted = TimeLog.all_objects.filter(pk=log.id).first()
>> "%SCRIPT%" echo not_in_default = TimeLog.objects.filter(pk=log.id).first()
>> "%SCRIPT%" echo all_pass ^&= line("Step 7 - SOFT DELETE (deleted_at popolato, escluso da default qs)", soft_deleted is not None and soft_deleted.deleted_at is not None and not_in_default is None)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 8: CLEANUP - hard delete del record di test
>> "%SCRIPT%" echo TimeLog.all_objects.filter(pk=log.id).delete()
>> "%SCRIPT%" echo cleaned = TimeLog.all_objects.filter(pk=log.id).first() is None
>> "%SCRIPT%" echo all_pass ^&= line("Step 8 - CLEANUP hard delete record di test", cleaned)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo print()
>> "%SCRIPT%" echo if all_pass:
>> "%SCRIPT%" echo     print("*** TUTTI I TEST PASSATI ***")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     print("*** ALCUNI TEST FALLITI - vedi righe [FAIL] sopra ***")
>> "%SCRIPT%" echo     raise SystemExit(1)

REM Copia lo script dentro il container e lo esegue.
echo === Esecuzione test ORM dentro container API === >> "%OUT%"
docker compose cp "%SCRIPT%" api:/tmp/verify-v133a.py
if errorlevel 1 (
    echo     [FAIL] docker cp fallito - container API non raggiungibile? >> "%OUT%"
    type "%OUT%"
    pause
    exit /b 1
)
docker compose exec -T api python /tmp/verify-v133a.py >> "%OUT%" 2>&1
set EXITCODE=%errorlevel%

REM Pulizia file temp
docker compose exec -T api rm -f /tmp/verify-v133a.py >nul 2>&1
del /Q "%SCRIPT%" 2>nul

echo. >> "%OUT%"
if !EXITCODE! NEQ 0 (
    echo *** VERIFICA FUNZIONALE FALLITA *** >> "%OUT%"
) else (
    echo *** VERIFICA FUNZIONALE OK - v1.33a stabile *** >> "%OUT%"
)

type "%OUT%"
echo.
echo ============================================================
echo Output: %OUT%
echo ============================================================
pause
exit /b !EXITCODE!
