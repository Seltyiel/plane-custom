#!/usr/bin/env python3
"""
Seed Plane con progetto Demo + 10 task + 3 subtask ciascuno.
Usa Plane REST API con X-Api-Key.

USO:
  python seed-demo.py --base http://localhost --slug <workspace-slug> --key <api-key>

Come ottenere API key:
  Plane UI -> avatar in alto a destra -> Settings -> API tokens -> Add API token
"""
import argparse
import sys
import json
import random
from datetime import date, timedelta

try:
    import requests
except ImportError:
    print("Installa 'requests':  pip install requests")
    sys.exit(1)


STATES_ORDER = ["Backlog", "Todo", "In Progress", "Done", "Cancelled"]
STATE_GROUPS = {
    "Backlog": "backlog",
    "Todo": "unstarted",
    "In Progress": "started",
    "Done": "completed",
    "Cancelled": "cancelled",
}
PRIORITIES = ["urgent", "high", "medium", "low", "none"]

TASK_NAMES = [
    "Landing page redesign",
    "Setup CI/CD pipeline",
    "User authentication flow",
    "Database schema migration",
    "API rate limiting",
    "Email notifications system",
    "Admin dashboard analytics",
    "Mobile responsive layout",
    "Performance optimization",
    "Documentation website",
]
SUBTASK_TEMPLATES = [
    "Research",
    "Implementation",
    "QA & Review",
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://localhost", help="Plane base URL")
    p.add_argument("--slug", required=True, help="Workspace slug")
    p.add_argument("--key", required=True, help="API key (X-Api-Key)")
    p.add_argument("--project", default="Demo", help="Nome progetto")
    p.add_argument("--identifier", default="DEMO", help="Identifier progetto (max 5 char UPPERCASE)")
    args = p.parse_args()

    base = args.base.rstrip("/")
    api = f"{base}/api/v1/workspaces/{args.slug}"
    headers = {"X-Api-Key": args.key, "Content-Type": "application/json"}

    def req(method, path, body=None, expect=(200, 201)):
        url = f"{api}{path}"
        r = requests.request(method, url, headers=headers, json=body, timeout=30)
        if r.status_code not in expect:
            print(f"[{method} {url}] HTTP {r.status_code}")
            print(r.text[:500])
            sys.exit(1)
        return r.json() if r.text else {}

    # 1) Ottieni l'utente corrente (per assegnare task)
    me = requests.get(f"{base}/api/v1/users/me/", headers=headers, timeout=30)
    if me.status_code != 200:
        # fallback endpoint su alcune versioni:
        me = requests.get(f"{base}/api/users/me/", headers=headers, timeout=30)
    me_id = None
    if me.status_code == 200:
        me_id = me.json().get("id")
        print(f"[OK] user id: {me_id}")
    else:
        print("[WARN] non riesco a leggere /users/me (status", me.status_code, "), i task non avranno assignee")

    # 2) Crea progetto
    print(f"[..] creo progetto '{args.project}' ({args.identifier})...")
    payload = {
        "name": args.project,
        "identifier": args.identifier.upper()[:5],
        "network": 2,  # 2 = public in workspace
    }
    try:
        proj = req("POST", "/projects/", payload)
        project_id = proj["id"]
        print(f"[OK] progetto creato: {project_id}")
    except SystemExit:
        # Se esiste gia', lo cerchiamo
        print("[..] forse esiste gia', provo a cercarlo...")
        existing = req("GET", "/projects/")
        results = existing.get("results", existing) if isinstance(existing, dict) else existing
        proj = next((p for p in results if p.get("identifier") == args.identifier.upper()), None)
        if not proj:
            print("[ERRORE] non trovato")
            sys.exit(1)
        project_id = proj["id"]
        print(f"[OK] progetto riusato: {project_id}")

    # 3) Leggi stati (Plane ne crea 5 di default)
    states = req("GET", f"/projects/{project_id}/states/")
    states_list = states.get("results", states) if isinstance(states, dict) else states
    by_name = {s["name"]: s for s in states_list}
    print(f"[OK] trovati {len(states_list)} stati: {[s['name'] for s in states_list]}")

    # 4) Crea 10 task con varieta'
    today = date.today()
    created_tasks = []
    for i, name in enumerate(TASK_NAMES):
        state_name = STATES_ORDER[i % len(STATES_ORDER)]
        state = by_name.get(state_name) or states_list[0]
        priority = PRIORITIES[i % len(PRIORITIES)]
        # Alcuni con date (per Calendar e Gantt), alcuni no
        start_offset = random.randint(-5, 5)
        duration = random.randint(2, 14)
        start_d = (today + timedelta(days=start_offset)).isoformat()
        target_d = (today + timedelta(days=start_offset + duration)).isoformat()

        body = {
            "name": name,
            "description_html": f"<p>Demo work item #{i+1}</p>",
            "state": state["id"],
            "priority": priority,
            "start_date": start_d,
            "target_date": target_d,
        }
        if me_id:
            body["assignees"] = [me_id]

        issue = req("POST", f"/projects/{project_id}/issues/", body)
        created_tasks.append(issue)
        print(f"  [OK] task #{i+1}: {name} ({state_name}/{priority})")

    # 5) Crea 3 subtask per ogni task (parent)
    print("[..] creo subtask...")
    for t in created_tasks:
        for j, sub_template in enumerate(SUBTASK_TEMPLATES):
            sub_state = by_name.get(STATES_ORDER[j % len(STATES_ORDER)]) or states_list[0]
            body = {
                "name": f"{sub_template}: {t['name']}",
                "parent": t["id"],
                "state": sub_state["id"],
                "priority": PRIORITIES[(j + 2) % len(PRIORITIES)],
            }
            if me_id:
                body["assignees"] = [me_id]
            req("POST", f"/projects/{project_id}/issues/", body)
    print(f"[OK] creati {len(created_tasks) * 3} subtask")

    print("\n========================================")
    print("FATTO! Apri:")
    print(f"  {base}/{args.slug}/projects/{project_id}/work-items/")
    print(f"  {base}/{args.slug}/profile/{me_id}/assigned")
    print("========================================")


if __name__ == "__main__":
    main()
