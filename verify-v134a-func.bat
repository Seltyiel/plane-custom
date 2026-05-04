@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica FUNZIONALE v1.34a
REM   (Meeting models + migration 0127)
REM ===========================================================
REM
REM Lancia DOPO build.bat con v1.34a applicato.
REM Verifica:
REM   - migration 0127 applicata
REM   - 3 tabelle (meetings, meeting_attendees, meeting_issue_links) presenti
REM   - models importabili da plane.db.models
REM   - CRUD base: create Meeting + Attendee (interno+esterno) + IssueLink
REM   - CheckConstraint end_at >= start_at funziona (rejected end<start)
REM   - CheckConstraint user XOR external_email funziona
REM   - Cleanup
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0verify-v134a-func-output.txt
set SCRIPT=%~dp0verify-v134a-func-script.py
cd /d "%PLANE_APP%"

echo === plane-custom v1.34a FUNCTIONAL verify === > "%OUT%"
echo Started at %DATE% %TIME% >> "%OUT%"
echo. >> "%OUT%"

REM Genera script Python.
> "%SCRIPT%" echo import os, sys, django
>> "%SCRIPT%" echo sys.path.insert(0, '/code')
>> "%SCRIPT%" echo os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
>> "%SCRIPT%" echo django.setup()
>> "%SCRIPT%" echo from datetime import timedelta
>> "%SCRIPT%" echo from django.utils import timezone
>> "%SCRIPT%" echo from django.db import IntegrityError, transaction
>> "%SCRIPT%" echo from plane.db.models import Workspace, Project, Issue, ProjectMember
>> "%SCRIPT%" echo from plane.db.models.meeting import Meeting, MeetingAttendee, MeetingIssueLink
>> "%SCRIPT%" echo from plane.app.serializers.meeting import MeetingSerializer
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo results = []
>> "%SCRIPT%" echo def check(label, ok, msg=""):
>> "%SCRIPT%" echo     ok_b = bool(ok)
>> "%SCRIPT%" echo     tag = "[PASS]" if ok_b else "[FAIL]"
>> "%SCRIPT%" echo     print(f"{tag} {label}{(': '+msg) if msg else ''}")
>> "%SCRIPT%" echo     results.append(ok_b)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo created_meeting_id = None
>> "%SCRIPT%" echo created_attendee_ids = []
>> "%SCRIPT%" echo created_link_ids = []
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 1: combo
>> "%SCRIPT%" echo pm = ProjectMember.objects.filter(is_active=True, deleted_at__isnull=True).select_related('project','member','workspace').first()
>> "%SCRIPT%" echo if not pm: print("[FAIL] No ProjectMember"); raise SystemExit(1)
>> "%SCRIPT%" echo issue = Issue.objects.filter(project=pm.project, deleted_at__isnull=True, archived_at__isnull=True).first()
>> "%SCRIPT%" echo if not issue: print("[FAIL] No issue"); raise SystemExit(1)
>> "%SCRIPT%" echo print(f"Test combo: workspace={pm.workspace.slug} project={pm.project.identifier} issue={issue.sequence_id} user={pm.member.email}")
>> "%SCRIPT%" echo check("Step 1 - combo found", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 2: tabella esistente via models import
>> "%SCRIPT%" echo check("Step 2 - models importabili (Meeting/Attendee/IssueLink)", True, f"Meeting.db_table={Meeting._meta.db_table}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 3: CREATE Meeting basic
>> "%SCRIPT%" echo now = timezone.now()
>> "%SCRIPT%" echo meeting = Meeting.objects.create(workspace=pm.workspace, project=pm.project, title='v1.34a verify test', description='Test meeting safe to delete', location='https://meet.test/abc', start_at=now+timedelta(hours=1), end_at=now+timedelta(hours=2), reminder_minutes_before=30, created_by=pm.member)
>> "%SCRIPT%" echo created_meeting_id = meeting.id
>> "%SCRIPT%" echo check("Step 3 - CREATE Meeting", meeting.id is not None, f"id={meeting.id}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 4: CheckConstraint end_at ^>= start_at (try invalid: end before start)
>> "%SCRIPT%" echo try:
>> "%SCRIPT%" echo     with transaction.atomic():
>> "%SCRIPT%" echo         Meeting.objects.create(workspace=pm.workspace, title='Bad meeting', start_at=now+timedelta(hours=2), end_at=now+timedelta(hours=1), created_by=pm.member)
>> "%SCRIPT%" echo     check("Step 4 - CheckConstraint end_at^>=start_at", False, "ACCEPTED end^<start (BUG!)")
>> "%SCRIPT%" echo except IntegrityError:
>> "%SCRIPT%" echo     check("Step 4 - CheckConstraint end_at^>=start_at", True, "IntegrityError as expected")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 5: CREATE Attendee internal (user)
>> "%SCRIPT%" echo att1 = MeetingAttendee.objects.create(meeting=meeting, user=pm.member, status='invited')
>> "%SCRIPT%" echo created_attendee_ids.append(att1.id)
>> "%SCRIPT%" echo check("Step 5 - CREATE MeetingAttendee internal (user)", att1.id is not None and att1.status == 'invited')
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 6: CREATE Attendee external (email)
>> "%SCRIPT%" echo att2 = MeetingAttendee.objects.create(meeting=meeting, external_email='guest@example.com', display_name='Guest User', status='invited', rsvp_token='test-token-' + str(meeting.id)[:8])
>> "%SCRIPT%" echo created_attendee_ids.append(att2.id)
>> "%SCRIPT%" echo check("Step 6 - CREATE MeetingAttendee external (email)", att2.id is not None and att2.external_email == 'guest@example.com')
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 7: CheckConstraint user XOR external_email (try BOTH set)
>> "%SCRIPT%" echo try:
>> "%SCRIPT%" echo     with transaction.atomic():
>> "%SCRIPT%" echo         MeetingAttendee.objects.create(meeting=meeting, user=pm.member, external_email='both@example.com', status='invited')
>> "%SCRIPT%" echo     check("Step 7 - CheckConstraint user XOR email (both set rejected)", False, "ACCEPTED both (BUG!)")
>> "%SCRIPT%" echo except IntegrityError:
>> "%SCRIPT%" echo     check("Step 7 - CheckConstraint user XOR email (both set rejected)", True, "IntegrityError as expected")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 8: CheckConstraint user XOR external_email (try NEITHER set)
>> "%SCRIPT%" echo try:
>> "%SCRIPT%" echo     with transaction.atomic():
>> "%SCRIPT%" echo         MeetingAttendee.objects.create(meeting=meeting, status='invited')
>> "%SCRIPT%" echo     check("Step 8 - CheckConstraint user XOR email (neither set rejected)", False, "ACCEPTED neither (BUG!)")
>> "%SCRIPT%" echo except IntegrityError:
>> "%SCRIPT%" echo     check("Step 8 - CheckConstraint user XOR email (neither set rejected)", True, "IntegrityError as expected")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 9: CREATE IssueLink
>> "%SCRIPT%" echo link = MeetingIssueLink.objects.create(meeting=meeting, issue=issue)
>> "%SCRIPT%" echo created_link_ids.append(link.id)
>> "%SCRIPT%" echo check("Step 9 - CREATE MeetingIssueLink", link.id is not None)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 10: UniqueConstraint (meeting, issue) - try duplicate
>> "%SCRIPT%" echo try:
>> "%SCRIPT%" echo     with transaction.atomic():
>> "%SCRIPT%" echo         MeetingIssueLink.objects.create(meeting=meeting, issue=issue)
>> "%SCRIPT%" echo     check("Step 10 - UniqueConstraint meeting+issue (duplicate rejected)", False, "ACCEPTED duplicate (BUG!)")
>> "%SCRIPT%" echo except IntegrityError:
>> "%SCRIPT%" echo     check("Step 10 - UniqueConstraint meeting+issue (duplicate rejected)", True, "IntegrityError as expected")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 11: Serializer espone i campi
>> "%SCRIPT%" echo data = MeetingSerializer(meeting).data
>> "%SCRIPT%" echo expected_keys = {'id','title','description','start_at','end_at','reminder_minutes_before','attendees','issue_links','creator_display_name','is_cancelled'}
>> "%SCRIPT%" echo missing = expected_keys - set(data.keys())
>> "%SCRIPT%" echo check("Step 11 - MeetingSerializer expone tutti i campi attesi", not missing, f"missing={missing}" if missing else "all keys present")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 12: Serializer attendees nested ha 2 entries
>> "%SCRIPT%" echo att_count = len(data.get('attendees', []))
>> "%SCRIPT%" echo check("Step 12 - serializer nested attendees count=2", att_count == 2, f"count={att_count}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 13: Cancellation fields
>> "%SCRIPT%" echo meeting.cancelled_at = now
>> "%SCRIPT%" echo meeting.cancelled_by = pm.member
>> "%SCRIPT%" echo meeting.cancellation_reason = 'Test cancel'
>> "%SCRIPT%" echo meeting.save()
>> "%SCRIPT%" echo refetched = Meeting.objects.get(pk=meeting.id)
>> "%SCRIPT%" echo check("Step 13 - cancellation fields work", refetched.cancelled_at is not None and refetched.cancellation_reason == 'Test cancel')
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # CLEANUP
>> "%SCRIPT%" echo MeetingIssueLink.all_objects.filter(pk__in=created_link_ids).delete()
>> "%SCRIPT%" echo MeetingAttendee.all_objects.filter(pk__in=created_attendee_ids).delete()
>> "%SCRIPT%" echo Meeting.all_objects.filter(pk=created_meeting_id).delete()
>> "%SCRIPT%" echo cleanup_ok = Meeting.all_objects.filter(pk=created_meeting_id).first() is None
>> "%SCRIPT%" echo check("Step 14 - CLEANUP test records", cleanup_ok)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo print()
>> "%SCRIPT%" echo if all(results):
>> "%SCRIPT%" echo     print(f"*** TUTTI I {len(results)} TEST PASSATI ***")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     failed = sum(1 for r in results if not r)
>> "%SCRIPT%" echo     print(f"*** {failed}/{len(results)} TEST FALLITI ***")
>> "%SCRIPT%" echo     raise SystemExit(1)

echo === Esecuzione test ORM dentro container API === >> "%OUT%"
docker compose cp "%SCRIPT%" api:/tmp/verify-v134a.py
if errorlevel 1 (
    echo     [FAIL] docker cp fallito >> "%OUT%"
    type "%OUT%"
    pause
    exit /b 1
)
docker compose exec -T api python /tmp/verify-v134a.py >> "%OUT%" 2>&1
set EXITCODE=%errorlevel%

docker compose exec -T api rm -f /tmp/verify-v134a.py >nul 2>&1
del /Q "%SCRIPT%" 2>nul

echo. >> "%OUT%"
if !EXITCODE! NEQ 0 (
    echo *** VERIFICA FUNZIONALE FALLITA *** >> "%OUT%"
) else (
    echo *** VERIFICA FUNZIONALE OK - v1.34a stabile *** >> "%OUT%"
)

type "%OUT%"
echo.
echo ============================================================
echo Output: %OUT%
echo ============================================================
pause
exit /b !EXITCODE!
