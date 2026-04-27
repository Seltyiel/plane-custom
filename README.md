# plane-custom

Overlay di patch su [makeplane/plane](https://github.com/makeplane/plane) self-hosted. Aggiunge:

- Tutti i 5 layout (List, Kanban, Calendar, Spreadsheet, Gantt) sia in **Workspace Views** che in **Your Work / Profile**.
- Filter parity completa fra scope project / workspace / profile.
- Una **People page** (Team dashboard) con avatar, contatori per state-group e timing, lista task espandibile in tree (task / subtask) con dropdown stock di Plane per editare inline state, priority, date, assignees e peek-overview cliccando un task.
- Backend Python aggiunto: aggregati `/members/stats/`, lista task per membro `/members/<uuid>/issues/`, group-by server-side per le workspace views.

Tutte le patch sono **full-replacement** dei file stock di Plane: niente fork del repo upstream, ogni build riclona Plane fresco e sovrascrive solo i file qui dentro.

---

## Requisiti

- Windows 10+ con `cmd.exe`
- Docker Desktop (con BuildKit attivo)
- Git
- Almeno 8 GB RAM liberi durante il build (web + api image insieme)

---

## Layout cartelle

```
plane-custom/
├── README.md              <- questo file
├── CHANGELOG.md           <- storia versioni v1.0 -> attuale
├── build.bat              <- script principale: clona Plane, applica patch, builda Docker
├── start-plane.bat        <- avvia stack docker compose
├── aggiorna.bat           <- shortcut: rebuild + restart
├── seed-demo.py           <- popola un workspace demo
├── Dockerfile.custom-web  <- override Dockerfile.web di Plane
├── diagnostic-server.js   <- HTTP server v1.13 per ricevere log in file (uso dev)
│
├── plane-setup/           <- compose stack Plane
│   ├── docker-compose.yml
│   ├── docker-compose.override.yml   (generato automaticamente da build.bat)
│   └── plane.env          (NON in git: contiene secrets)
│
└── patches/               <- 40 file di patch organizzati per area
    ├── 00-core/                       (1 file: marker custom build)
    ├── 01-layouts/
    │   ├── workspace-roots/           (4: list/kanban/calendar/gantt scope workspace)
    │   ├── profile-roots/             (3: spreadsheet/calendar/gantt scope profile)
    │   ├── base-roots/                (5: base*-root.tsx)
    │   └── shared/                    (6: HOC, helpers, layout-utils)
    ├── 02-filters/                    (6: filter parity v1.17 + service fix v1.04)
    ├── 03-backend/                    (4: Python views + url routing)
    ├── 04-people-page/                (8: People page + sidebar entry + service)
    └── 99-diagnostics/                (3: logger / error-boundary / global error capture)
```

---

## Build flow

`build.bat` fa, in ordine:

1. **Clone fresco** di `makeplane/plane` (branch preview) in `%USERPROFILE%\plane-build\source\plane` (FUORI da OneDrive, per evitare i sync lag che hanno gia' causato bug in v1.19b).
2. **Applica le patch** di `patches/` come full file replacement sui path stock di Plane.
3. **Build immagine `plane-web-custom:latest`** dal `Dockerfile.custom-web`.
4. **Build immagine `plane-api-custom:latest`** dal `Dockerfile.api` stock di Plane (con i .py patchati gia' nei sorgenti).
5. **Genera `docker-compose.override.yml`** che sostituisce le immagini upstream con le custom.
6. **Restart** dei container (`web`, `api`, `worker`, `beat-worker`).

Per buildare:

```bat
cd C:\Users\acamp\OneDrive\Documenti\Claude\Projects\Projectmanagement\plane-custom
build.bat
```

Il primo build richiede 25-50 minuti (web + api image). Successivamente, se serve solo il web (modifiche frontend), si puo' editare `build.bat` per saltare lo step api.

---

## Verifica build attiva

A sidebar bottom di Plane, accanto al pulsante **Community**, deve apparire un badge verde con la versione corrente (es. `PATCHED v1.19c`). Se manca, l'override Docker non e' attivo: controlla che `docker-compose.override.yml` sia presente in `..\plane-app\` e che i container girino sulle immagini `plane-web-custom:latest` / `plane-api-custom:latest`.

---

## Convenzioni patches

- Ogni file di patch inizia con un blocco di commento che documenta:
  - Versione (`PATCH (plane-custom) v1.X`)
  - Cosa cambia rispetto allo stock
  - Razionale del cambio
- Nessun file di patch e' indipendente: tutti vengono copiati su file stock di Plane. Nuovi file additivi (es. backend `team_stats.py`) sono comunque trattati come patch perche' build.bat li copia.
- Per aggiungere una nuova patch:
  1. Creare il file in `patches/<feature-folder>/`
  2. Aggiungere una `copy /Y` in `build.bat` (sezione appropriata)
  3. Bumpare `CUSTOM_PATCH_TAG` in `patches/00-core/edition-badge.tsx`
  4. Aggiornare `CHANGELOG.md`

---

## Storia versioni

Vedi [CHANGELOG.md](./CHANGELOG.md) per il log completo da v1.0 in poi. Le versioni in chiaro stanno anche dentro `patches/00-core/edition-badge.tsx` (i commenti precedenti al tag).

---

## Roadmap

- **v1.20**: workspace-level states (Opzione B - states condivisi a livello workspace)
- **v1.21**: drag &amp; drop su state group column nella People page
- **v1.22**: Create task da Calendar / workspace-views / your-work (oggi solo da progetto)
