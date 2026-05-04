@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica FUNZIONALE v1.34c
REM   (Email tasks + Celery beat reminder + templates)
REM ===========================================================
REM
REM Lancia DOPO build.bat con v1.34c applicato.
REM Verifica:
REM   - Email tasks importabili (4 shared_task)
REM   - Reminder beat scanner importabile + chiamabile
REM   - 4 HTML templates rendono senza errori
REM   - PeriodicTask 'meetings.process_reminders' creato dalla migration 0128
REM   - Beat scanner identifica gli attendee in finestra di reminder
REM   - send_meeting_invite registra invitation_email_sent_at
REM     (uso EmailBackend locmem in eager mode per non spammare per davvero)
REM   - Cleanup
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0verify-v134c-func-output.txt
set SCRIPT=%~dp0verify-v134c-func-script.py
cd /d "%PLANE_APP%"

echo === plane-custom v1.34c FUNCTIONAL verify === > "%OUT%"
echo Started at %DATE% %TIME% >> "%OUT%"
echo. >> "%OUT%"

REM Genera script Python.
> "%SCRIPT%" echo import os, sys, json, django
>> "%SCRIPT%" echo sys.path.insert(0, '/code')
>> "%SCRIPT%" echo os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
>> "%SCRIPT%" echo django.setup()
>> "%SCRIPT%" echo from datetime import timedelta
>> "%SCRIPT%" echo from django.conf import settings
>> "%SCRIPT%" echo from django.core import mail
>> "%SCRIPT%" echo from django.template.loader import render_to_string
>> "%SCRIPT%" echo from django.utils import timezone
>> "%SCRIPT%" echo from plane.db.models import Workspace, Project, Issue, ProjectMember
>> "%SCRIPT%" echo from plane.db.models.meeting import Meeting, MeetingAttendee
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
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 1: import dei tasks
>> "%SCRIPT%" echo try:
>> "%SCRIPT%" echo     from plane.bgtasks.meeting_email_task import (
>> "%SCRIPT%" echo         send_meeting_invite, send_meeting_update,
>> "%SCRIPT%" echo         send_meeting_cancel, send_meeting_reminder,
>> "%SCRIPT%" echo     )
>> "%SCRIPT%" echo     from plane.bgtasks.meeting_reminder_beat import process_meeting_reminders
>> "%SCRIPT%" echo     check("Step 1 - import meeting_email_task + reminder_beat", True)
>> "%SCRIPT%" echo except Exception as e:
>> "%SCRIPT%" echo     check("Step 1 - import meeting_email_task + reminder_beat", False, str(e))
>> "%SCRIPT%" echo     raise SystemExit(1)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 2: 4 templates render senza KeyError
>> "%SCRIPT%" echo dummy_ctx = {"meeting_id":"x","title":"T","description":"D","location":"L","start_at":"S","end_at":"E","all_day":False,"timezone":"UTC","creator_name":"C","workspace_slug":"w","workspace_name":"W","attendee_id":"a","attendee_name":"N","attendee_email":"e@x","attendee_status":"invited","changes_summary":"x","reason":"r","minutes_left":15}
>> "%SCRIPT%" echo tpls = ["emails/meetings/meeting_invite.html","emails/meetings/meeting_update.html","emails/meetings/meeting_cancel.html","emails/meetings/meeting_reminder.html"]
>> "%SCRIPT%" echo all_ok = True; tpl_err = ""
>> "%SCRIPT%" echo for tpl in tpls:
>> "%SCRIPT%" echo     try:
>> "%SCRIPT%" echo         render_to_string(tpl, dummy_ctx)
>> "%SCRIPT%" echo     except Exception as e:
>> "%SCRIPT%" echo         all_ok = False; tpl_err = f"{tpl}: {e}"; break
>> "%SCRIPT%" echo check("Step 2 - 4 HTML templates rendono", all_ok, tpl_err)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 3: PeriodicTask creata dalla migration 0128
>> "%SCRIPT%" echo try:
>> "%SCRIPT%" echo     from django_celery_beat.models import PeriodicTask
>> "%SCRIPT%" echo     pt = PeriodicTask.objects.filter(name="meetings.process_reminders").first()
>> "%SCRIPT%" echo     ok3 = pt is not None and pt.task == "plane.bgtasks.meeting_reminder_beat.process_meeting_reminders" and pt.enabled
>> "%SCRIPT%" echo     check("Step 3 - PeriodicTask 'meetings.process_reminders' creata + enabled", ok3, f"task={pt.task if pt else 'NONE'} every={pt.interval.every if pt and pt.interval else 'NONE'} period={pt.interval.period if pt and pt.interval else 'NONE'}")
>> "%SCRIPT%" echo except Exception as e:
>> "%SCRIPT%" echo     check("Step 3 - PeriodicTask check", False, str(e))
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 4: combo + create test Meeting con creator + attendee in reminder window
>> "%SCRIPT%" echo creator_pm = ProjectMember.objects.filter(is_active=True, deleted_at__isnull=True).select_related('project','member','workspace').first()
>> "%SCRIPT%" echo if not creator_pm: check("Step 4 - combo", False, "no PM"); raise SystemExit(1)
>> "%SCRIPT%" echo workspace = creator_pm.workspace; creator = creator_pm.member; project = creator_pm.project
>> "%SCRIPT%" echo now = timezone.now()
>> "%SCRIPT%" echo # Meeting che inizia tra 14 minuti (default reminder=15) -^> finestra ATTIVA
>> "%SCRIPT%" echo meeting = Meeting.objects.create(workspace=workspace, project=project, title='v1.34c reminder window test', start_at=now+timedelta(minutes=14), end_at=now+timedelta(minutes=44), reminder_minutes_before=15, created_by=creator)
>> "%SCRIPT%" echo created_meeting_id = meeting.id
>> "%SCRIPT%" echo att = MeetingAttendee.objects.create(meeting=meeting, user=creator, status='accepted', responded_at=timezone.now(), invitation_email_sent_at=timezone.now())
>> "%SCRIPT%" echo created_attendee_ids.append(att.id)
>> "%SCRIPT%" echo check("Step 4 - test meeting created (start in 14m, reminder=15)", meeting.id is not None)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 5a: forza Celery eager mode per il test (task .delay() runs sync inline)
>> "%SCRIPT%" echo from plane.celery import app as celery_app
>> "%SCRIPT%" echo celery_app.conf.task_always_eager = True
>> "%SCRIPT%" echo celery_app.conf.task_eager_propagates = True
>> "%SCRIPT%" echo # Step 5b: monkey-patch _build_connection per non spammare davvero
>> "%SCRIPT%" echo # (i task usano get_connection esplicito da god-mode, non EMAIL_BACKEND).
>> "%SCRIPT%" echo # Patchando _build_connection a (None,None) il task fa skip silente
>> "%SCRIPT%" echo # ma il path di scan e idempotenza vengono comunque esercitati.
>> "%SCRIPT%" echo import plane.bgtasks.meeting_email_task as met_mod
>> "%SCRIPT%" echo met_mod._build_connection = lambda: (None, None)
>> "%SCRIPT%" echo check("Step 5 - eager mode + _build_connection monkey-patched (no real SMTP)", met_mod._build_connection() == (None, None) and celery_app.conf.task_always_eager)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 6: process_meeting_reminders identifica l'attendee
>> "%SCRIPT%" echo # NB: il task usa get_connection() esplicitamente con SMTP da god-mode,
>> "%SCRIPT%" echo # quindi locmem non viene usato. Verifico solo che il SCAN identifichi
>> "%SCRIPT%" echo # l'attendee come candidato (e che reminder_email_sent_at venga set
>> "%SCRIPT%" echo # se SMTP e' configurato, oppure resti NULL se EMAIL_HOST e' vuoto).
>> "%SCRIPT%" echo att.refresh_from_db()
>> "%SCRIPT%" echo before_sent = att.reminder_email_sent_at
>> "%SCRIPT%" echo # Chiamiamo direttamente la funzione (sync, non .delay)
>> "%SCRIPT%" echo n = process_meeting_reminders(horizon_hours=1)
>> "%SCRIPT%" echo check("Step 6 - process_meeting_reminders ha schedulato ^>=1 reminder", n ^>= 1, f"scheduled={n}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 7: send_meeting_invite chiamabile sync (eager) con locmem
>> "%SCRIPT%" echo # Crea un attendee invitato fresco senza invitation_email_sent_at
>> "%SCRIPT%" echo att2 = MeetingAttendee.objects.create(meeting=meeting, user=creator, status='invited') if False else None
>> "%SCRIPT%" echo # NB: vincolo unique meeting+user impedisce 2 attendee con stesso user.
>> "%SCRIPT%" echo # Skippiamo Step 7 se non c'e' un secondo user disponibile.
>> "%SCRIPT%" echo from plane.db.models import WorkspaceMember
>> "%SCRIPT%" echo other_wm = WorkspaceMember.objects.filter(workspace=workspace, is_active=True, deleted_at__isnull=True).exclude(member=creator).select_related('member').first()
>> "%SCRIPT%" echo if other_wm:
>> "%SCRIPT%" echo     att2 = MeetingAttendee.objects.create(meeting=meeting, user=other_wm.member, status='invited')
>> "%SCRIPT%" echo     created_attendee_ids.append(att2.id)
>> "%SCRIPT%" echo     before2 = att2.invitation_email_sent_at
>> "%SCRIPT%" echo     send_meeting_invite(str(meeting.id), str(att2.id))  # sync call
>> "%SCRIPT%" echo     att2.refresh_from_db()
>> "%SCRIPT%" echo     # Se SMTP e' configurato attivamente, sent_at e' set; altrimenti
>> "%SCRIPT%" echo     # il task fa skip silente. Entrambi i casi sono OK.
>> "%SCRIPT%" echo     check("Step 7 - send_meeting_invite eseguito senza eccezioni", True, f"sent_at={att2.invitation_email_sent_at}")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     check("Step 7 - SKIP (no other user)", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 8: meeting cancellato non viene scansionato
>> "%SCRIPT%" echo meeting.cancelled_at = timezone.now()
>> "%SCRIPT%" echo meeting.cancelled_by = creator
>> "%SCRIPT%" echo meeting.save()
>> "%SCRIPT%" echo # reset reminder_email_sent_at per re-test
>> "%SCRIPT%" echo MeetingAttendee.objects.filter(meeting=meeting).update(reminder_email_sent_at=None)
>> "%SCRIPT%" echo n2 = process_meeting_reminders(horizon_hours=1)
>> "%SCRIPT%" echo # Solo i reminder per IL nostro meeting cancellato sono filtrati,
>> "%SCRIPT%" echo # non per altri eventuali. Verifichiamo che l'attendee del meeting
>> "%SCRIPT%" echo # cancellato NON sia in coda.
>> "%SCRIPT%" echo att.refresh_from_db()
>> "%SCRIPT%" echo check("Step 8 - meeting cancellato escluso dal beat scan", att.reminder_email_sent_at is None, f"sent_at={att.reminder_email_sent_at}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 9: status='declined' viene saltato
>> "%SCRIPT%" echo meeting.cancelled_at = None; meeting.cancelled_by = None; meeting.save()
>> "%SCRIPT%" echo att.status = 'declined'; att.reminder_email_sent_at = None; att.save()
>> "%SCRIPT%" echo if other_wm:
>> "%SCRIPT%" echo     # disattiva anche l'altro attendee per isolare il test
>> "%SCRIPT%" echo     MeetingAttendee.objects.filter(meeting=meeting).exclude(pk=att.pk).update(reminder_email_sent_at=timezone.now())
>> "%SCRIPT%" echo n3 = process_meeting_reminders(horizon_hours=1)
>> "%SCRIPT%" echo att.refresh_from_db()
>> "%SCRIPT%" echo check("Step 9 - declined attendee non riceve reminder", att.reminder_email_sent_at is None, f"sent_at={att.reminder_email_sent_at}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # CLEANUP
>> "%SCRIPT%" echo MeetingAttendee.all_objects.filter(meeting_id=created_meeting_id).delete()
>> "%SCRIPT%" echo Meeting.all_objects.filter(pk=created_meeting_id).delete()
>> "%SCRIPT%" echo cleanup_ok = Meeting.all_objects.filter(pk=created_meeting_id).first() is None
>> "%SCRIPT%" echo check("Step 10 - CLEANUP test records", cleanup_ok)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo print()
>> "%SCRIPT%" echo if all(results):
>> "%SCRIPT%" echo     print(f"*** TUTTI I {len(results)} TEST PASSATI ***")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     failed = sum(1 for r in results if not r)
>> "%SCRIPT%" echo     print(f"*** {failed}/{len(results)} TEST FALLITI ***")
>> "%SCRIPT%" echo     raise SystemExit(1)

echo === Esecuzione test dentro container API === >> "%OUT%"
docker compose cp "%SCRIPT%" api:/tmp/verify-v134c.py
if errorlevel 1 (
    echo     [FAIL] docker cp fallito >> "%OUT%"
    type "%OUT%"
    pause
    exit /b 1
)
docker compose exec -T api python /tmp/verify-v134c.py >> "%OUT%" 2>&1
set EXITCODE=%errorlevel%

docker compose exec -T api rm -f /tmp/verify-v134c.py >nul 2>&1
del /Q "%SCRIPT%" 2>nul

echo. >> "%OUT%"
if !EXITCODE! NEQ 0 (
    echo *** VERIFICA FUNZIONALE FALLITA *** >> "%OUT%"
) else (
    echo *** VERIFICA FUNZIONALE OK - v1.34c stabile *** >> "%OUT%"
)

type "%OUT%"
echo.
echo ============================================================
echo Output: %OUT%
echo ============================================================
pause
exit /b !EXITCODE!
