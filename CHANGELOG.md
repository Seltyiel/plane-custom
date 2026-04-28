# Changelog

Tutte le modifiche notabili a `plane-custom`. Formato basato su [Keep a Changelog](https://keepachangelog.com/), versioning incrementale interno (non semver upstream Plane).

La fonte di verita' alternativa e' il commento storico in `patches/00-core/edition-badge.tsx`, qui in formato strutturato.

---

## [v1.22e] - 2026-04-28

### Aggiunto
- **Marker visivo "Workspace task"** su `IssueIdentifier` shared (`apps/web/ce/components/issues/issue-details/issue-identifier.tsx`). Una sola patch copre tutti i 5 layout (list/kanban/calendar/gantt/spreadsheet) + peek-overview + parent-select + relations + power-k.
- Icona `Globe2` (lucide-react) + `<Tooltip>` con contenuto "Workspace task", visibile solo quando `projectId === workspaceHiddenProjectId`.

### Note
- Color `text-tertiary` per non rubare attenzione al titolo. Dimensione `size-3` o `size-3.5` in base alla prop `size` dell'identifier.
- I task di progetti reali non mostrano nulla in piu' (nessuna regressione visiva).

---

## [v1.22d] - 2026-04-28

### Aggiunto
- **Pulsante "+ Add work item"** sulle pagine workspace-level dove mancava completamente, scoperte da test utente in v1.22c.
- People page (`/<slug>/people`): `Header.RightItem` con `<Button primary>` "Add work item" che chiama `toggleCreateIssueModal(true, EIssuesStoreType.PROJECT, undefined)`.
- Your Work page (`/<slug>/profile/<userId>/...`): stesso pulsante in `Header.RightItem` accanto a `ProfileIssuesFilter`.
- Workspace Views page (`/<slug>/workspace-views/<viewId>`): pulsante prima di "Add view" gia' esistente.

### Modificato
- `IProjectStore` interface: aggiunto `workspaceHiddenProjectId: string | undefined` (era solo nella class implementation v1.22b — i consumer tipati non compilavano).

### Note
- Permission gate: ADMIN/MEMBER del workspace (`allowPermissions`). Disabilitato se non ci sono né progetti joined né workspace project.
- `allowedProjectIds=undefined` nel modal → l'utente sceglie il project nel picker (incluso il "Workspace" project in cima grazie a v1.22c).
- Il modal globale e' montato in `WorkItemLevelModals` al livello layout, quindi basta togglare `isCreateIssueModalOpen` dal command-palette store.

---

## [v1.22c] - 2026-04-28

### Aggiunto
- **UI Create work item con voce "Workspace"** in cima al picker progetto.
- `ProjectDropdown` patchato per concatenare `workspaceHiddenProjectId` (dal store v1.22b) in cima a `joinedProjectIds`.
- `IssueProjectSelect` del modal: chiama `useWorkspaceProject()` (lazy fetch + cache) + estende `renderCondition` per accettare il workspace project anche se non in `allowedProjectIds`.

### Note
- L'utente seleziona "Workspace" nel picker → il task viene creato con `project_id` del progetto fittizio. Lato DB e' un Issue normale (compare in workspace views, your-work, ecc).
- Step successivi: v1.22d (route alias `/<slug>/work-items/<id>` + marker visivo "Workspace task" nelle viste).

---

## [v1.22b] - 2026-04-28

### Aggiunto
- **Frontend store + service + hook** per progetto fittizio workspace-level (Opzione A).
- `IPartialProject.is_hidden?: boolean` aggiunto al type.
- `WorkspaceProjectService.getWorkspaceProject(slug)` — service che consuma `/api/workspaces/<slug>/workspace-project/` (backend v1.22a, lazy get_or_create idempotente).
- `useWorkspaceProject()` hook SWR-based — dedup automatico delle chiamate concorrenti, ritorna `{workspaceProject, isLoading, error}`.
- `ProjectStore.workspaceHiddenProjectId` getter — ritorna l'ID del progetto fittizio se presente nel `projectMap`.

### Modificato
- `ProjectStore`: 4 getter (`workspaceProjectIds`, `joinedProjectIds`, `archivedProjectIds`, `favoriteProjectIds`, e il filter del sidebar) ora escludono progetti `is_hidden=true`. Il progetto fittizio non appare piu' nel sidebar Projects ne' nei picker stock.

### Note
- Step successivi: v1.22c (UI modal Create work item con voce "Workspace" + visualizzazione marker workspace task), v1.22d (route `/<slug>/work-items/<id>`).

---

## [v1.22a] - 2026-04-28

### Aggiunto
- **Foundation backend per task workspace-level** (Opzione A: progetto fittizio).
- `Project.is_hidden` BooleanField default False, db_index. Marca i progetti "fittizi" (non visibili da sidebar/picker).
- Migration `0123_v122a_project_is_hidden`.
- Endpoint `GET /api/workspaces/<slug>/workspace-project/` — lazy `get_or_create` del progetto fittizio "Workspace":
  - name `"Workspace"`, identifier `"WS"` (con suffisso numerico se collide), network Secret, features cycle/module/intake/page/views disabilitate.
  - Crea i 6 default state (skip se workspace ha shared states v1.20a).
  - Sincronizza `ProjectMember` con `WorkspaceMember` attivi (additivo + idempotente).
  - Atomicita' via `transaction.atomic` (evita race condition).
- Permission: `WorkspaceEntityPermission`.

### Note
- Step successivi: v1.22b (frontend store filter is_hidden + workspaceProjectId hook), v1.22c (UI Create modal con voce "Workspace" in cima al picker), v1.22d (URL alias `/work-items/<id>` + visualizzazione marker workspace task).
- Approccio scelto: progetto fittizio invece di `Issue.project_id NULL` per evitare refactor profondo (5+ aree backend, ~10 file, 4 migration). Costo stimato 1-2 giorni vs 5-7 giorni del refactor puro.

---

## [v1.21] - 2026-04-28

### Aggiunto
- **Drag-and-drop in List view su `state_detail.group` group_by** — sblocca il drop fra le 5 colonne state-group (Backlog/Unstarted/Started/Completed/Cancelled) in workspace views, your-work e profile. Stock di Plane ammetteva drop solo su 6 group_by (state, priority, assignees, labels, module, cycle); il workspace usa `state_detail.group` perche' gli state UUID per-project non si possono raggrupare cross-project.

### Modificato
- `packages/constants/src/issue/common.ts` → `DRAG_ALLOWED_GROUPS += "state_detail.group"`. Sblocca il check `isDragAllowed` in list-group.tsx (riga 249) e quindi `isDraggingAllowed` in block.tsx (riga 112). Il toast "Drag and drop is disabled for the current grouping" non compare piu'.
- `apps/web/core/components/issues/issue-layouts/utils.tsx` → `handleGroupDragDrop` con un 9° parametro opzionale `getStatesByProject(projectId)`. Quando `groupBy === "state_detail.group"` il drop viene risolto in `state_id`: cerca uno state del project del task con `state.group === destination.groupId` e setta `updatedIssue.state_id = targetState.id`.
- `apps/web/core/hooks/use-group-dragndrop.ts` → estrae `stateMap` da `useProjectState`, costruisce `getStatesByProject` inline e lo passa al `handleGroupDragDrop`.

### Note
- Spreadsheet drag-and-drop: lo stock non ha drop fra group (le righe non sono raggruppate). Skip in v1.21.
- Vincolo: gli state del project del task devono essere nel `stateMap` (caricati). Workspace views fetchano `workspaceStates` a init, che li include tutti.

---

## [v1.20 hotfix #2b] - 2026-04-28

### Risolto
- **PATCH issue continuava a tornare 400 anche dopo hotfix #2**: scoperto via dump del codice nel container. `IssueViewSet.partial_update` passa solo `context={"project_id": project_id}` senza `workspace_id`. La mia `Q(project__isnull=True, workspace_id=self.context.get("workspace_id"))` diventava `workspace_id=None`, che non matcha nessun shared state (`workspace_id` NOT NULL su `State`).
- Fix: derivo `_ws_id` in tutti i 4 punti di validate via fallback chain — `self.instance.workspace_id` (partial_update) → `self.context.get("workspace_id")` (se passato) → `Project.objects.filter(pk=project_id).values_list("workspace_id")` (create). Garantisce che lo state shared dello stesso workspace dell'issue passi la validation.

---

## [v1.20 hotfix #2] - 2026-04-28

### Risolto
- **Backend rifiutava workspace shared state come state_id di un issue**: validation in 4 punti (`api/serializers/issue.py`, `app/serializers/issue.py` x2, `app/serializers/draft.py`) controllava `State.objects.filter(project_id=ctx.project_id, pk=state.id).exists()`. Workspace shared (project=NULL) non passava → 400 `State is not valid please pass a valid state_id`.
- Fix: condizione rilassata a `Q(project_id=ctx.project_id) | Q(project__isnull=True, workspace_id=ctx.workspace_id)`. Lo shared state resta vincolato al medesimo workspace dell'issue (no cross-workspace).

---

## [v1.20] - 2026-04-27 (v1.20d, milestone completa)

### Aggiunto
- **Workspace Settings → States**: nuova pagina `/<workspaceSlug>/settings/states/` per gestire i workspace shared states (CRUD via UI). Riusa `GroupList` e `ProjectStateLoader` di Plane stock. Permission: Admin/Member visualizzano, solo Admin edita.
- **Voce sidebar workspace settings** "States" con icona Layers nel gruppo `ADMINISTRATION`, accanto a General/Members/Billing/Export.
- **`StateDropdown` con merge automatico**: il dropdown ora mostra `project state ids ∪ workspace shared state ids`. Su `onDropdownOpen` fetcha entrambi gli scope (idempotente via `fetchedMap`).
- Nuovi componenti: `WorkspaceStateRoot` + `WorkspaceStateLoader` (analoghi di `ProjectStateRoot`), pagina + header settings.
- Route: `/:workspaceSlug/settings/states/` registrata in `routes/core.ts`.

### Modificato
- `TWorkspaceSettingsTabs` ora include `"states"`.
- `WORKSPACE_SETTINGS["states"]` aggiunto al mapping costanti + `GROUPED_WORKSPACE_SETTINGS[ADMINISTRATION]`.

### Note
- Milestone v1.20 (workspace-level shared states, Opzione 3) **completa** con questa release. Sub-versioni:
  - v1.20a: backend schema (State.project nullable + 2 conditional uniques + migration 0122 + ProjectViewSet skip)
  - v1.20b: backend API CRUD endpoints
  - v1.20c: frontend store + service (4 actions, 3 computed, 2 getter)
  - v1.20d: UI Workspace Settings + StateDropdown integration

---

## [v1.20c] - 2026-04-27

### Aggiunto
- **Workspace-level shared states** (step 3 di 4) — frontend store + service.
- `ProjectStateService`: 4 nuovi metodi REST CRUD per shared states:
  - `createWorkspaceState(slug, data)` → POST `/api/workspaces/<slug>/states/`
  - `patchWorkspaceState(slug, stateId, data)` → PATCH stesso path
  - `deleteWorkspaceState(slug, stateId)` → DELETE
  - `markWorkspaceStateAsDefault(slug, stateId)` → POST `.../mark-default/`
- `StateStore`: 4 nuove action MobX (`createWorkspaceState`, `updateWorkspaceState`, `deleteWorkspaceState`, `markWorkspaceStateAsDefault`) con optimistic update + rollback su errore.
- `StateStore`: 3 nuove computed (`workspaceSharedStateIds`, `workspaceSharedStates`, `groupedWorkspaceSharedStates`) e 2 getter (`getWorkspaceSharedStateById`, `getWorkspaceSharedDefaultStateId`).
- Guardia: gli action workspace rifiutano di operare su state project-local (e viceversa) per evitare confusione.

### Note
- Lato UI niente cambia: nessun consumer ancora usa queste API. La integrazione StateDropdown + UI Workspace Settings arrivano in v1.20d.
- Tutti gli state (project + shared) vivono nello stesso `stateMap`: la distinzione e' runtime via `state.project_id`.

---

## [v1.20b] - 2026-04-27

### Aggiunto
- **Workspace-level shared states** (step 2 di 4) — API endpoints CRUD.
- `POST /workspaces/<slug>/states/` — crea uno workspace shared state (project=NULL forzato).
- `PATCH /workspaces/<slug>/states/<uuid:pk>/` — modifica nome / colore / group / sequence / default.
- `DELETE /workspaces/<slug>/states/<uuid:pk>/` — cancella, con check default=False e nessun Issue che lo usa.
- `POST /workspaces/<slug>/states/<uuid:pk>/mark-default/` — set default=True (e reset su altri shared dello stesso workspace).

### Modificato
- `GET /workspaces/<slug>/states/` (esistente) — query estesa: include sia project states (filtrati per project membership come stock) sia tutti gli workspace shared states (`project IS NULL`), via `Q(project__isnull=True) | Q(stock-membership-filter)`. Necessario perche' v1.20a introduce shared states che non hanno project — il filtro stock li avrebbe esclusi.

### Permission
- GET (list / retrieve) aperto a Admin/Member/Guest del workspace (`WorkspaceEntityPermission`).
- POST / PATCH / DELETE / mark-default riservati a Admin (`WorkspaceAdminPermission`).

### Note
- Step successivi: v1.20c (frontend store/service), v1.20d (UI Workspace + Project settings).

---

## [v1.20a] - 2026-04-27

### Aggiunto
- **Workspace-level shared states** (Opzione 3, step 1 di 4) — backend schema.
- `State.project` diventa NULLABLE: stato con `project=NULL` + `workspace=X` e' visibile da tutti i progetti del workspace.
- Due `UniqueConstraint` condizionali separano gli scope: project-local vs workspace-shared.
- Migration `0122_v120a_workspace_level_states.py`: AlterField nullable + AlterUniqueTogether vuoto + RemoveConstraint legacy + AddConstraint x 2.
- `ProjectViewSet.create`: skippa la creazione dei 6 `DEFAULT_STATES` se esistono gia' workspace shared states (back-compat per workspace pre-v1.20a).

### Modificato
- `State` non eredita piu' da `ProjectBaseModel` (che ha `project FK NOT NULL`); definisce esplicitamente i due FK + override `save()` per popolare workspace dal project quando disponibile.

### Note
- Nessun dato esistente toccato. Tutti gli `Issue.state_id` continuano a puntare ai loro project states.
- Step successivi: v1.20b (API CRUD endpoints), v1.20c (frontend store/service), v1.20d (UI Workspace + Project settings).

---

## [v1.19c] - 2026-04-27

### Aggiunto
- **People page interattiva** (stile spreadsheet). Tutti i task nella tree espandibile sono ora editabili inline:
  - Identifier + nome → apre il peek-overview standard di Plane via `useIssuePeekOverviewRedirection`.
  - State, Priority, Start date, Target date → dropdown stock di Plane, `onChange` chiama `IssueService.patchIssue` poi `mutate(swrKey)` per rinfrescare la lista del membro.
  - Assignees → `MemberDropdown` multiple.
- **Counter Active / Overdue** sulla summary row: ora `<button>` togglabili che filtrano la tree espansa.
- **Chip state-group e timing**: clic per filtrare; clic di nuovo per reset; banner di filtro attivo con pulsante Clear.
- **Layout**: grid 6 colonne con header sticky, bordi sottili, hover, allineato ai layout stock di Plane.

### Modificato
- `patches/04-people-page/people-page.tsx` riscritto completamente. Componenti `IssueRow`, `ExpandedTree`, `MemberRow`, `FilterChip`.

---

## [v1.19b] - 2026-04-26

### Aggiunto
- **Backend**: `GET /api/workspaces/<slug>/members/<uuid:user_id>/issues/` (`patches/03-backend/api-team-issues-view.py`). Lista flat di task attivi (backlog / unstarted / started) per un membro, con `parent_id` per costruire l'albero lato client.
- **Frontend**: `PeopleStatsService.fetchMemberIssues(slug, userId)` in `patches/04-people-page/people-stats-service.ts`.

### Modificato
- People page passa da layout a card a **lista / tabella espandibile**: una riga per membro, click espande mostrando tree dei task con indent progressivo per subtask.
- Lazy-load via SWR per ogni membro (chiave `member-issues-<slug>-<id>`).

---

## [v1.19] - 2026-04-25

### Aggiunto
- **People page** (Team dashboard) come nuova rotta workspace-level `/:workspaceSlug/people`.
- Voce sidebar `people` (icona `Users` da lucide-react), accessibile a Admin e Member, posizionata sotto Projects.
- `PeopleStatsService` consuma `/members/stats/` (v1.18).
- Card per ogni membro: avatar, nome, email, badge ruolo, conteggi per state-group (backlog / unstarted / started / completed / cancelled), conteggi temporali (overdue / due_this_week / no_target_date).
- `RESTRICTED_URLS += "people"` per evitare collisione con slug progetti.

---

## [v1.18] - 2026-04-25

### Aggiunto
- **Backend**: `GET /api/workspaces/<slug>/members/stats/` (`patches/03-backend/api-team-stats-view.py`).
- Aggregati per ogni membro attivo del workspace: totali per state-group, total_active, overdue, due_this_week, no_target_date.
- Ordinamento alfabetico case-insensitive su `display_name`. Guest inclusi (role=5).
- Access control: scope workspace, conta solo issue di progetti dove il requesting user e' membro attivo.

---

## [v1.17] - 2026-04-24

### Aggiunto
- Filter parity completa fra `issues.*` (project), `my_issues.*` (workspace views), `profile_issues.*` (your work).
- `my_issues.filters`: + `state_id`, `mention_id`, `cycle_id`, `module_id` (totale 13 filtri).
- `my_issues.list/kanban.group_by/sub_group_by`: + `state`, `assignees`, `created_by`.
- `my_issues.list/kanban.order_by`: + `target_date`.
- `my_issues.kanban.extra_options.values`: + `sub_issue`.
- `my_issues.spreadsheet.order_by`: da [] a lista standard.
- `profile_issues.filters`: + `state_id`, `mention_id`, `subscriber_id` (totale 11 filtri).
- `profile_issues.list/kanban.group_by/sub_group_by`: + `state`, `created_by`.
- `profile_issues.list/kanban.order_by`: + `target_date`.

---

## [v1.16] - 2026-04-23

### Risolto
- **Calendar workspace vuoto**: rimossa la `fetchIssues` redundante di `AllIssueLayoutRoot` che vinceva la race contro la fetch grouped del Calendar (`groupedBy:target_date, perPage:4`) ritornando un array piatto e collassando il bucketing server-side. Ora la SWR root fa solo `fetchFilters`; ogni layout root gestisce la sua fetch.

---

## [v1.15] - 2026-04-23

### Risolto
- **Backend `WorkspaceViewIssuesViewSet` non leggeva `group_by`**: il viewset Django delle workspace views ignorava il param e ritornava sempre array piatto, anche se il frontend mandava `group_by=state__group`.
- Fix: portato il pattern di `WorkspaceUserProfileIssuesEndpoint` (`issue_queryset_grouper` + `issue_on_results` + `issue_group_values` + `GroupedOffsetPaginator` o `SubGroupedOffsetPaginator`) dentro `WorkspaceViewIssuesViewSet.list()`.
- Build: aggiunta `plane-api-custom:latest` con `view/base.py` patchato; `docker-compose.override.yml` ora sovrascrive anche `api`, `worker`, `beat-worker`, `migrator`.

---

## [v1.14] - 2026-04-22

### Modificato
- Augmentation `group_by` da `state` a `state_detail.group` per allinearsi all'allowed list di `kanban.display_filters`.

### Note
- Fix corretto ma insufficiente: il backend ignorava comunque il param. Risolto in v1.15.

---

## [v1.13] - 2026-04-22

### Aggiunto
- **Diagnostica file-based**: `diagnostic-server.js` (HTTP server su :9999) + `patches/99-diagnostics/diagnostic-logger.ts` (modulo `dlog(cat, msg, data)`). Tracce in `base-kanban-root`, `issue-layout-HOC`, `workspace-filter-store`, `layouts-utils`, `kanban-default`.
- Workflow: utente lancia `node diagnostic-server.js`, rebuilda, apre la Kanban; le tracce vanno in `diagnostic.log`.

---

## [v1.12] - 2026-04-22

### Modificato
- Workspace Kanban root: clone 1:1 di `profile-issues-root.tsx` stock (passa `viewId`, scope workspace-level come GLOBAL).

---

## [v1.11] - 2026-04-22

### Modificato
- Workspace Kanban root: clone 1:1 di `project-root.tsx` stock (~30 righe, pattern minimale). Rimossi `useWorkspaceIssueProperties`, `useIssues` diagnostico, useEffect tracing.

### Note
- Insufficiente: project-root non passa viewId; lo store GLOBAL senza viewId non sa quale vista fetchare. Risolto in v1.12.

---

## [v1.10] - 2026-04-22

### Risolto
- **Cascade failure Kanban → List**: `workspace-filter-store.ts` scriveva `group_by="state"` nel displayFilters condiviso quando l'utente apriva Kanban. Tornando su List, `group_by` restava "state" → `getGroupByColumns` cercava state columns → `workspaceStates` non sempre pronti → schermo bianco.
- Fix Profile-aligned:
  - Rimosso write di `group_by="state"` in `fetchFilters` + `updateFilters`.
  - `getIssueFilters` ora ritorna una **vista augmentata non-mutating** con `group_by="state"` solo quando layout=KANBAN e l'utente non ha scelto un group_by.

### Rimosso
- `kanban-default.tsx` e `list-default.tsx` v1.09 (erano solo diagnostica, non risolvevano nulla). `list-default.tsx` rimosso definitivamente in v1.19c reorg.

---

## [v1.08] - 2026-04-22

### Risolto
- **Cascade failure layout switch**: `fetchIssues` / `fetchNextIssues` / `fetchIssuesWithExistingPagination` erano fire-and-forget. Quando una fetch veniva abortita al cambio layout, `workspace.service` trasformava `AbortError` in `throw undefined`. Ora tutti i 5 base root + il `global-view.store` hanno `?.catch(swallowAbort)`.

---

## [v1.07] - 2026-04-21

### Risolto
- `getStateColumns` / `getCreatedByColumns` per scope workspace: ora usano `workspaceStates` / `workspaceMemberIds`. Prima ricadevano su `projectStates undefined` → `List/Kanban default.tsx` restituivano null → schermo bianco.

---

## [v1.06] - 2026-04-21

### Aggiunto
- Tracce dentro `issue-layout-HOC.tsx` per capire se mostra loader / empty / children.

---

## [v1.05] - 2026-04-21

### Aggiunto
- Logger categorizzato + tracce diagnostiche nel dispatcher e nel Kanban root.

---

## [v1.04] - 2026-04-21

### Aggiunto
- `entry.client.tsx` con global error logger su `window` e `onRecoverableError` (smaschera errori React minificati).
- Fix `workspace.service.ts`: 11 metodi che facevano `throw error?.response` senza `.data` ritornavano `undefined`.

---

## [v1.03] - 2026-04-21

### Modificato
- `ErrorBoundary` diagnostico spostato dentro il dispatcher `ce-views-helper.tsx`.
- Default `group_by` per Kanban nel workspace filter store.

---

## [v1.0 - v1.02] - 2026-04-20 / 21

### Aggiunto
- **5 layout (List, Board, Calendar, Table, Gantt)** sia in Workspace Views che in Your Work / Profile.
- Riscritto `profile-issues.tsx` per supportare tutti i layout.
- Riscritto workspace views helper.
- Configurato `ISSUE_DISPLAY_FILTERS_BY_PAGE.profile_issues`.
- Build script `build.bat` con clone fresco fuori OneDrive (v1.0 era dentro OneDrive, spostato in v1.02 per evitare Files On-Demand sync issues).
- Sostituito Dockerfile custom con build ufficiale Plane + patch overlay.
- Marker visibile `PATCHED v1` accanto a Community per verificare a occhio la build custom attiva.

### Risolto
- Pagina Your Work > Assigned vuota.
- ce-views-helper truncato in stock; full replacement.
- `fetchIssuesWithExistingPagination` rigetta con `undefined` (precursore della fix v1.08).

---

## Repo reorganization (2026-04-27)

Non e' una versione di feature ma una pulizia strutturale:

- Cancellato `source/plane/` (89 MB) duplicato dentro OneDrive: `build.bat` riclona gia' fresco fuori da OneDrive a ogni build.
- Cancellato `patches/__pycache__/` e `patches/list-default.tsx` (morto da v1.10).
- Riorganizzato `patches/` flat in 9 sotto-cartelle per feature: `00-core`, `01-layouts/{workspace-roots,profile-roots,base-roots,shared}`, `02-filters`, `03-backend`, `04-people-page`, `99-diagnostics`.
- Aggiornato `build.bat` con i nuovi path (40 sostituzioni).
- Aggiunti `README.md`, `CHANGELOG.md`, `.gitignore`.
- `git init` + primo commit.
