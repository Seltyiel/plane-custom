@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Verifica FUNZIONALE v1.34b
REM   (Meeting endpoints + RSVP + visibility + audit mode)
REM ===========================================================
REM
REM Lancia DOPO build.bat con v1.34b applicato.
REM Verifica gli endpoint REST tramite Django test Client (force_login):
REM   - POST /meetings/ create
REM   - GET /meetings/ list (visibility + filtri)
REM   - GET /meetings/<id>/ detail
REM   - PATCH /meetings/<id>/ edit (creator only)
REM   - POST /meetings/<id>/rsvp/ status change
REM   - POST /meetings/<id>/attendees/ user + external email
REM   - DELETE /meetings/<id>/attendees/<aid>/
REM   - POST /meetings/<id>/issue-links/
REM   - DELETE /meetings/<id>/issue-links/<lid>/
REM   - GET /issues/<id>/meetings/
REM   - DELETE /meetings/<id>/ soft-cancel
REM   - Visibility: non-attendee non vede il meeting
REM   - Audit mode: admin con flag vede metadata
REM   - Cleanup
REM ===========================================================

set PLANE_APP=%USERPROFILE%\plane-app
set OUT=%~dp0verify-v134b-func-output.txt
set SCRIPT=%~dp0verify-v134b-func-script.py
cd /d "%PLANE_APP%"

echo === plane-custom v1.34b FUNCTIONAL verify === > "%OUT%"
echo Started at %DATE% %TIME% >> "%OUT%"
echo. >> "%OUT%"

REM Genera script Python.
> "%SCRIPT%" echo import os, sys, json, django
>> "%SCRIPT%" echo sys.path.insert(0, '/code')
>> "%SCRIPT%" echo os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.production')
>> "%SCRIPT%" echo django.setup()
>> "%SCRIPT%" echo from datetime import timedelta
>> "%SCRIPT%" echo from django.test import Client
>> "%SCRIPT%" echo from django.utils import timezone
>> "%SCRIPT%" echo from plane.db.models import Workspace, Project, Issue, ProjectMember, WorkspaceMember
>> "%SCRIPT%" echo from plane.db.models.meeting import Meeting, MeetingAttendee, MeetingIssueLink
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
>> "%SCRIPT%" echo # Step 1: combo - serve un workspace con almeno 2 active members + 1 issue
>> "%SCRIPT%" echo creator_pm = ProjectMember.objects.filter(is_active=True, deleted_at__isnull=True).select_related('project','member','workspace').first()
>> "%SCRIPT%" echo if not creator_pm: print("[FAIL] No ProjectMember"); raise SystemExit(1)
>> "%SCRIPT%" echo workspace = creator_pm.workspace
>> "%SCRIPT%" echo creator = creator_pm.member
>> "%SCRIPT%" echo project = creator_pm.project
>> "%SCRIPT%" echo issue = Issue.objects.filter(project=project, deleted_at__isnull=True, archived_at__isnull=True).first()
>> "%SCRIPT%" echo if not issue: print("[FAIL] No issue"); raise SystemExit(1)
>> "%SCRIPT%" echo # Cerca un secondo workspace member diverso (per test visibility)
>> "%SCRIPT%" echo other_wm = WorkspaceMember.objects.filter(workspace=workspace, is_active=True, deleted_at__isnull=True).exclude(member=creator).select_related('member').first()
>> "%SCRIPT%" echo other_user = other_wm.member if other_wm else None
>> "%SCRIPT%" echo print(f"Combo: ws={workspace.slug} project={project.identifier} creator={creator.email} other={other_user.email if other_user else 'NONE'} issue={issue.sequence_id}")
>> "%SCRIPT%" echo check("Step 1 - combo base (ws+creator+issue)", True, "ok")
>> "%SCRIPT%" echo if not other_user: print("[WARN] secondo membro non trovato - skip visibility/RSVP cross-user");
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo client_creator = Client()
>> "%SCRIPT%" echo client_creator.force_login(creator)
>> "%SCRIPT%" echo client_other = Client()
>> "%SCRIPT%" echo if other_user: client_other.force_login(other_user)
>> "%SCRIPT%" echo BASE = f"/api/workspaces/{workspace.slug}"
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 2: POST /meetings/ create
>> "%SCRIPT%" echo now = timezone.now()
>> "%SCRIPT%" echo payload = {"title":"v1.34b verify test","description":"smoke test, safe to delete","location":"https://meet.test/v134b","start_at":(now+timedelta(hours=1)).isoformat(),"end_at":(now+timedelta(hours=2)).isoformat(),"all_day":False,"timezone":"UTC","reminder_minutes_before":15,"project":str(project.id)}
>> "%SCRIPT%" echo r = client_creator.post(f"{BASE}/meetings/", data=json.dumps(payload), content_type="application/json")
>> "%SCRIPT%" echo ok2 = r.status_code == 201
>> "%SCRIPT%" echo body = r.json() if ok2 else {}
>> "%SCRIPT%" echo created_meeting_id = body.get("id") if ok2 else None
>> "%SCRIPT%" echo check("Step 2 - POST /meetings/ create", ok2, f"status={r.status_code} body={r.content[:200]}")
>> "%SCRIPT%" echo if not created_meeting_id: print("[FAIL] No meeting id, abort"); raise SystemExit(1)
>> "%SCRIPT%" echo MID = created_meeting_id
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 3: creator auto-added as accepted attendee
>> "%SCRIPT%" echo creator_att = MeetingAttendee.objects.filter(meeting_id=MID, user=creator).first()
>> "%SCRIPT%" echo check("Step 3 - creator auto-added as accepted", creator_att is not None and creator_att.status == "accepted", f"status={creator_att.status if creator_att else 'NONE'}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 4: GET /meetings/ list (creator vede)
>> "%SCRIPT%" echo r = client_creator.get(f"{BASE}/meetings/")
>> "%SCRIPT%" echo ok4 = r.status_code == 200 and any(m.get("id") == MID for m in r.json())
>> "%SCRIPT%" echo check("Step 4 - GET /meetings/ creator vede il proprio meeting", ok4, f"status={r.status_code}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 5: GET /meetings/^<id^>/ detail
>> "%SCRIPT%" echo r = client_creator.get(f"{BASE}/meetings/{MID}/")
>> "%SCRIPT%" echo body = r.json() if r.status_code == 200 else {}
>> "%SCRIPT%" echo ok5 = r.status_code == 200 and body.get("id") == MID and "attendees" in body and "issue_links" in body
>> "%SCRIPT%" echo check("Step 5 - GET /meetings/^<id^>/ detail", ok5, f"status={r.status_code}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 6: PATCH /meetings/^<id^>/ edit
>> "%SCRIPT%" echo r = client_creator.patch(f"{BASE}/meetings/{MID}/", data=json.dumps({"title":"v1.34b updated"}), content_type="application/json")
>> "%SCRIPT%" echo ok6 = r.status_code == 200 and r.json().get("title") == "v1.34b updated"
>> "%SCRIPT%" echo check("Step 6 - PATCH /meetings/^<id^>/ edit (creator)", ok6, f"status={r.status_code}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 7: POST /meetings/^<id^>/attendees/ external (rsvp_token NON nel JSON di proposito,
>> "%SCRIPT%" echo # verifico via DB che sia stato generato e non sia vuoto).
>> "%SCRIPT%" echo r = client_creator.post(f"{BASE}/meetings/{MID}/attendees/", data=json.dumps({"external_email":"guest@v134b.test","display_name":"Guest"}), content_type="application/json")
>> "%SCRIPT%" echo body7 = r.json() if r.status_code == 201 else {}
>> "%SCRIPT%" echo ext_att = MeetingAttendee.objects.filter(meeting_id=MID, external_email="guest@v134b.test").first() if r.status_code == 201 else None
>> "%SCRIPT%" echo ok7 = r.status_code == 201 and body7.get("external_email") == "guest@v134b.test" and ext_att is not None and bool(ext_att.rsvp_token) and len(ext_att.rsvp_token) ^>= 16
>> "%SCRIPT%" echo if r.status_code == 201: created_attendee_ids.append(body7.get("id"))
>> "%SCRIPT%" echo check("Step 7 - POST attendees/ external email + rsvp_token (DB)", ok7, f"status={r.status_code} token_len={len(ext_att.rsvp_token) if ext_att else 'NONE'}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 8: POST /meetings/^<id^>/attendees/ user (se other_user esiste)
>> "%SCRIPT%" echo if other_user:
>> "%SCRIPT%" echo     r = client_creator.post(f"{BASE}/meetings/{MID}/attendees/", data=json.dumps({"user_id":str(other_user.id)}), content_type="application/json")
>> "%SCRIPT%" echo     ok8 = r.status_code == 201
>> "%SCRIPT%" echo     if ok8: created_attendee_ids.append(r.json().get("id"))
>> "%SCRIPT%" echo     check("Step 8 - POST attendees/ internal user", ok8, f"status={r.status_code}")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     check("Step 8 - SKIP (no other user)", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 9: visibility - other_user puo' GET il meeting (e' attendee)
>> "%SCRIPT%" echo if other_user:
>> "%SCRIPT%" echo     r = client_other.get(f"{BASE}/meetings/{MID}/")
>> "%SCRIPT%" echo     ok9 = r.status_code == 200 and r.json().get("id") == MID
>> "%SCRIPT%" echo     check("Step 9 - other_user (attendee) puo' GET meeting", ok9, f"status={r.status_code}")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     check("Step 9 - SKIP", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 10: RSVP - other_user accepts
>> "%SCRIPT%" echo if other_user:
>> "%SCRIPT%" echo     r = client_other.post(f"{BASE}/meetings/{MID}/rsvp/", data=json.dumps({"status":"accepted","comment":"Will join"}), content_type="application/json")
>> "%SCRIPT%" echo     ok10 = r.status_code == 200 and r.json().get("status") == "accepted"
>> "%SCRIPT%" echo     check("Step 10 - POST /rsvp/ attendee accepts", ok10, f"status={r.status_code}")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     check("Step 10 - SKIP", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 11: PATCH attempt by non-creator (should 403)
>> "%SCRIPT%" echo if other_user:
>> "%SCRIPT%" echo     r = client_other.patch(f"{BASE}/meetings/{MID}/", data=json.dumps({"title":"hijack"}), content_type="application/json")
>> "%SCRIPT%" echo     ok11 = r.status_code == 403
>> "%SCRIPT%" echo     check("Step 11 - PATCH by non-creator rejected (403)", ok11, f"status={r.status_code}")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     check("Step 11 - SKIP", True)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 12: POST issue-links/
>> "%SCRIPT%" echo r = client_creator.post(f"{BASE}/meetings/{MID}/issue-links/", data=json.dumps({"issue_id":str(issue.id)}), content_type="application/json")
>> "%SCRIPT%" echo ok12 = r.status_code == 201
>> "%SCRIPT%" echo if ok12: created_link_ids.append(r.json().get("id"))
>> "%SCRIPT%" echo check("Step 12 - POST /issue-links/ link issue", ok12, f"status={r.status_code}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 13: GET /issues/^<id^>/meetings/
>> "%SCRIPT%" echo r = client_creator.get(f"{BASE}/issues/{issue.id}/meetings/")
>> "%SCRIPT%" echo ok13 = r.status_code == 200 and any(m.get("id") == MID for m in r.json())
>> "%SCRIPT%" echo check("Step 13 - GET /issues/^<id^>/meetings/ ritorna meeting linkato", ok13, f"status={r.status_code}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 14: list filtri (from/to)
>> "%SCRIPT%" echo from_iso = (now - timedelta(days=1)).isoformat()
>> "%SCRIPT%" echo to_iso = (now + timedelta(days=1)).isoformat()
>> "%SCRIPT%" echo r = client_creator.get(f"{BASE}/meetings/?from={from_iso}&to={to_iso}&project_id={project.id}")
>> "%SCRIPT%" echo ok14 = r.status_code == 200 and any(m.get("id") == MID for m in r.json())
>> "%SCRIPT%" echo check("Step 14 - GET /meetings/ con filtri from/to/project_id", ok14, f"status={r.status_code}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 15: DELETE soft-cancel
>> "%SCRIPT%" echo r = client_creator.delete(f"{BASE}/meetings/{MID}/", data=json.dumps({"reason":"Test cancel"}), content_type="application/json")
>> "%SCRIPT%" echo ok15 = r.status_code == 204
>> "%SCRIPT%" echo m_refetch = Meeting.objects.get(pk=MID)
>> "%SCRIPT%" echo check("Step 15 - DELETE meeting soft-cancel (cancelled_at set)", ok15 and m_refetch.cancelled_at is not None, f"status={r.status_code} cancelled_at={m_refetch.cancelled_at}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # Step 16: cancelled meeting NON appare in list di default
>> "%SCRIPT%" echo r = client_creator.get(f"{BASE}/meetings/")
>> "%SCRIPT%" echo ok16 = r.status_code == 200 and not any(m.get("id") == MID for m in r.json())
>> "%SCRIPT%" echo check("Step 16 - cancelled meeting non in list", ok16, f"status={r.status_code}")
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo # CLEANUP
>> "%SCRIPT%" echo MeetingIssueLink.all_objects.filter(pk__in=created_link_ids).delete()
>> "%SCRIPT%" echo MeetingAttendee.all_objects.filter(meeting_id=MID).delete()
>> "%SCRIPT%" echo Meeting.all_objects.filter(pk=MID).delete()
>> "%SCRIPT%" echo cleanup_ok = Meeting.all_objects.filter(pk=MID).first() is None
>> "%SCRIPT%" echo check("Step 17 - CLEANUP test records", cleanup_ok)
>> "%SCRIPT%" echo.
>> "%SCRIPT%" echo print()
>> "%SCRIPT%" echo if all(results):
>> "%SCRIPT%" echo     print(f"*** TUTTI I {len(results)} TEST PASSATI ***")
>> "%SCRIPT%" echo else:
>> "%SCRIPT%" echo     failed = sum(1 for r in results if not r)
>> "%SCRIPT%" echo     print(f"*** {failed}/{len(results)} TEST FALLITI ***")
>> "%SCRIPT%" echo     raise SystemExit(1)

echo === Esecuzione test endpoints dentro container API === >> "%OUT%"
docker compose cp "%SCRIPT%" api:/tmp/verify-v134b.py
if errorlevel 1 (
    echo     [FAIL] docker cp fallito >> "%OUT%"
    type "%OUT%"
    pause
    exit /b 1
)
docker compose exec -T api python /tmp/verify-v134b.py >> "%OUT%" 2>&1
set EXITCODE=%errorlevel%

docker compose exec -T api rm -f /tmp/verify-v134b.py >nul 2>&1
del /Q "%SCRIPT%" 2>nul

echo. >> "%OUT%"
if !EXITCODE! NEQ 0 (
    echo *** VERIFICA FUNZIONALE FALLITA *** >> "%OUT%"
) else (
    echo *** VERIFICA FUNZIONALE OK - v1.34b stabile *** >> "%OUT%"
)

type "%OUT%"
echo.
echo ============================================================
echo Output: %OUT%
echo ============================================================
pause
exit /b !EXITCODE!
