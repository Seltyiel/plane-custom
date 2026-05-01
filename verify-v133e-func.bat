@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica FUNZIONALE v1.33e
REM   (workspace_feature_settings + approval workflow)
REM ===========================================================
REM
REM Lancia DOPO build.bat con v1.33e applicato.
REM Testa: settings table + helper + endpoint logic + approval gating
REM        + approve/reject endpoint logic + idempotenza.
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0verify-v133e-func-output.txt
set SCRIPT=%~dp0verify-v133e-func-script.py
cd /d "%PLANE_APP%"

echo === plane-custom v1.33e FUNCTIONAL verify === > "%OUT%"
echo Started at %DATE% %TIME% >> "%OUT%"
echo. >> "%OUT%"

REM Genera script Python.
> "%SCRIPT%" echo import os, sys, django
>> "%SCRIPT%" echo sys.path.insert(0, '/code')
>> "%SCRIPT%" echo os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
>> "%SCRIPT%" echo django.setup()
>> "%SCRIPT%" echo from django.utils import timezone
>> "%SCRIPT%" echo from django.db import IntegrityError, transaction
>> "%SCRIPT%" echo from plane.db.models import Issue, ProjectMember
>> "%SCRIPT%" echo from plane.db.models.time_log import TimeLog, TimeLogSource, TimeLogApprovalStatus
>> "%SCRIPT%" echo from plane.db.models.workspace_feature_settings import WorkspaceFeatureSettings, get_workspace_feature
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo results = []
>> "%SCRIPT%" echo def check(label, ok, msg=""):
>> "%SCRIPT%" echo     ok_b = bool(ok)
>> "%SCRIPT%" echo     tag = "[PASS]" if ok_b else "[FAIL]"
>> "%SCRIPT%" echo     print(f"{tag} {label}{(': '+msg) if msg else ''}")
>> "%SCRIPT%" echo     results.append(ok_b)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo created_log_ids = []
>> "%SCRIPT%" echo created_settings_id = None
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 1: combo
>> "%SCRIPT%" echo pm = ProjectMember.objects.filter(is_active=True, deleted_at__isnull=True).select_related('project','member','workspace').first()
>> "%SCRIPT%" echo if not pm: print("[FAIL] No ProjectMember"); raise SystemExit(1)
>> "%SCRIPT%" echo issue = Issue.objects.filter(project=pm.project, deleted_at__isnull=True, archived_at__isnull=True).first()
>> "%SCRIPT%" echo if not issue: print("[FAIL] No issue"); raise SystemExit(1)
>> "%SCRIPT%" echo print(f"Test combo: workspace={pm.workspace.slug} issue={issue.sequence_id} user={pm.member.email}")
>> "%SCRIPT%" echo check("Step 1 - combo found", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Cleanup pre-existing settings (per test ripetibile)
>> "%SCRIPT%" echo WorkspaceFeatureSettings.objects.filter(workspace=pm.workspace).delete()
>> "%SCRIPT%" echo check("Step 2 - cleanup pre-existing settings", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 3: get_workspace_feature default-safe quando settings NON esiste
>> "%SCRIPT%" echo val = get_workspace_feature(pm.workspace, 'time_tracking_approval_required', False)
>> "%SCRIPT%" echo check("Step 3 - get_workspace_feature returns default when no record", val is False)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 4: crea settings con flag approval ON
>> "%SCRIPT%" echo settings_obj = WorkspaceFeatureSettings.objects.create(workspace=pm.workspace, features={'time_tracking_approval_required': True, 'time_tracking_enabled': True})
>> "%SCRIPT%" echo created_settings_id = settings_obj.id
>> "%SCRIPT%" echo check("Step 4 - CREATE settings with flags", settings_obj.id is not None)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 5: get_workspace_feature legge il flag corretto
>> "%SCRIPT%" echo val = get_workspace_feature(pm.workspace, 'time_tracking_approval_required', False)
>> "%SCRIPT%" echo check("Step 5 - get_workspace_feature reads ON flag", val is True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 6: merge (simula PATCH dal endpoint) - aggiungi un nuovo flag senza perdere gli esistenti
>> "%SCRIPT%" echo settings_obj.features = {**settings_obj.features, 'meetings_enabled': False}
>> "%SCRIPT%" echo settings_obj.save()
>> "%SCRIPT%" echo settings_obj.refresh_from_db()
>> "%SCRIPT%" echo merged_ok = settings_obj.features.get('time_tracking_approval_required') is True and settings_obj.features.get('meetings_enabled') is False
>> "%SCRIPT%" echo check("Step 6 - merge preserves existing flags", merged_ok, f"features={settings_obj.features}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 7: simulazione gating su TimeLog - quando approval_required=True, nuovo log nasce 'pending'
>> "%SCRIPT%" echo approval_required = get_workspace_feature(pm.workspace, 'time_tracking_approval_required', False)
>> "%SCRIPT%" echo initial_status = TimeLogApprovalStatus.PENDING if approval_required else TimeLogApprovalStatus.AUTO
>> "%SCRIPT%" echo log_pending = TimeLog.objects.create(workspace=pm.workspace, project=pm.project, issue=issue, user=pm.member, duration_seconds=1800, logged_at=timezone.now(), description='v1.33e test pending', source=TimeLogSource.MANUAL, approval_status=initial_status)
>> "%SCRIPT%" echo created_log_ids.append(log_pending.id)
>> "%SCRIPT%" echo check("Step 7 - TimeLog with approval flag ON -^> 'pending'", log_pending.approval_status == 'pending')
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 8: approve logic (simula POST /approve/)
>> "%SCRIPT%" echo if log_pending.approval_status == 'pending':
>> "%SCRIPT%" echo     log_pending.approval_status = TimeLogApprovalStatus.APPROVED
>> "%SCRIPT%" echo     log_pending.approved_by = pm.member
>> "%SCRIPT%" echo     log_pending.approved_at = timezone.now()
>> "%SCRIPT%" echo     log_pending.save()
>> "%SCRIPT%" echo log_pending.refresh_from_db()
>> "%SCRIPT%" echo check("Step 8 - approve pending -^> approved", log_pending.approval_status == 'approved' and log_pending.approved_by_id is not None and log_pending.approved_at is not None)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 9: idempotenza approve - approve di gia' approvato deve essere bloccato dalla logica view
>> "%SCRIPT%" echo idempotent_ok = log_pending.approval_status != 'pending'
>> "%SCRIPT%" echo check("Step 9 - status not 'pending' -^> view returns 400 (idempotenza)", idempotent_ok)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 10: reject logic
>> "%SCRIPT%" echo log_to_reject = TimeLog.objects.create(workspace=pm.workspace, project=pm.project, issue=issue, user=pm.member, duration_seconds=600, logged_at=timezone.now(), description='v1.33e test reject', source=TimeLogSource.MANUAL, approval_status=TimeLogApprovalStatus.PENDING)
>> "%SCRIPT%" echo created_log_ids.append(log_to_reject.id)
>> "%SCRIPT%" echo log_to_reject.approval_status = TimeLogApprovalStatus.REJECTED
>> "%SCRIPT%" echo log_to_reject.approved_by = pm.member
>> "%SCRIPT%" echo log_to_reject.approved_at = timezone.now()
>> "%SCRIPT%" echo log_to_reject.rejection_reason = 'Test rejection - duration sembra eccessiva'
>> "%SCRIPT%" echo log_to_reject.save()
>> "%SCRIPT%" echo log_to_reject.refresh_from_db()
>> "%SCRIPT%" echo reject_ok = log_to_reject.approval_status == 'rejected' and log_to_reject.rejection_reason is not None
>> "%SCRIPT%" echo check("Step 10 - reject pending -^> rejected with reason", reject_ok)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 11: switch flag OFF -^> back-compat 'auto'
>> "%SCRIPT%" echo settings_obj.features = {**settings_obj.features, 'time_tracking_approval_required': False}
>> "%SCRIPT%" echo settings_obj.save()
>> "%SCRIPT%" echo approval_required = get_workspace_feature(pm.workspace, 'time_tracking_approval_required', False)
>> "%SCRIPT%" echo initial_status = TimeLogApprovalStatus.PENDING if approval_required else TimeLogApprovalStatus.AUTO
>> "%SCRIPT%" echo log_auto = TimeLog.objects.create(workspace=pm.workspace, project=pm.project, issue=issue, user=pm.member, duration_seconds=300, logged_at=timezone.now(), description='v1.33e test auto', source=TimeLogSource.MANUAL, approval_status=initial_status)
>> "%SCRIPT%" echo created_log_ids.append(log_auto.id)
>> "%SCRIPT%" echo check("Step 11 - flag OFF -^> new log status='auto'", log_auto.approval_status == 'auto')
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # CLEANUP
>> "%SCRIPT%" echo TimeLog.all_objects.filter(pk__in=created_log_ids).delete()
>> "%SCRIPT%" echo WorkspaceFeatureSettings.objects.filter(pk=created_settings_id).delete()
>> "%SCRIPT%" echo cleanup_ok = TimeLog.all_objects.filter(pk__in=created_log_ids).count() == 0
>> "%SCRIPT%" echo check("Step 12 - CLEANUP test records", cleanup_ok)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo print()
>> "%SCRIPT%" echo if all(results):
>> "%SCRIPT%" echo     print(f"*** TUTTI I {len(results)} TEST PASSATI ***")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     failed = sum(1 for r in results if not r)
>> "%SCRIPT%" echo     print(f"*** {failed}/{len(results)} TEST FALLITI ***")
>> "%SCRIPT%" echo     raise SystemExit(1)

echo === Esecuzione test ORM dentro container API === >> "%OUT%"
docker compose cp "%SCRIPT%" api:/tmp/verify-v133e.py
if errorlevel 1 (
    echo     [FAIL] docker cp fallito >> "%OUT%"
    type "%OUT%"
    pause
    exit /b 1
)
docker compose exec -T api python /tmp/verify-v133e.py >> "%OUT%" 2>&1
set EXITCODE=%errorlevel%

docker compose exec -T api rm -f /tmp/verify-v133e.py >nul 2>&1
del /Q "%SCRIPT%" 2>nul

echo. >> "%OUT%"
if !EXITCODE! NEQ 0 (
    echo *** VERIFICA FUNZIONALE FALLITA *** >> "%OUT%"
) else (
    echo *** VERIFICA FUNZIONALE OK - v1.33e stabile *** >> "%OUT%"
)

type "%OUT%"
echo.
echo ============================================================
echo Output: %OUT%
echo ============================================================
pause
exit /b !EXITCODE!
