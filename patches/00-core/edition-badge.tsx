/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// ui
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
import packageJson from "package.json";
// local components
import { PaidPlanUpgradeModal } from "../license";
import { Button } from "@plane/propel/button";

// Marker visibile per verificare che la build custom sia quella attiva.
// Se vedi questo badge "PATCHED v1.20b" accanto a "Community", stai usando
// la versione con le patch dei 5 layout (List/Board/Calendar/Table/Gantt)
// in Workspace Views e Your Work, la filter parity v1.17, l'endpoint
// backend del Team dashboard v1.18, la People page frontend v1.19/b/c, lo
// schema workspace-level states v1.20a, e gli API endpoints CRUD v1.20b.
//
// v1.20b: Workspace-level shared states - API endpoints CRUD.
//   STEP 2 di 4 della milestone v1.20.
//   - workspace/state.py (full replacement): WorkspaceStatesEndpoint esteso
//     con POST oltre al GET (con filtro modificato per includere project=NULL),
//     piu' nuovi WorkspaceStateDetailEndpoint (GET/PATCH/DELETE) e
//     WorkspaceStateMarkDefaultEndpoint (POST).
//   - urls/workspace.py: 2 nuove path() registrate:
//       /workspaces/<slug>/states/<uuid:pk>/                (Detail)
//       /workspaces/<slug>/states/<uuid:pk>/mark-default/   (MarkDefault)
//   - Permission: GET aperto a Member; POST/PATCH/DELETE/mark-default
//     riservati ad Admin (WorkspaceAdminPermission).
//   - DELETE: vieta default=True e refusa se Issue.state_id=pk esiste.
//   - PATCH: non permette di cambiare project_id (resta NULL).
//
//   Cosa NON fa v1.20b:
//   - Frontend store / service / dropdown integration (-> v1.20c).
//   - UI Workspace Settings + Project Settings toggle (-> v1.20d).
//
//   Verifica build:
//     1. POST /workspaces/<slug>/states/ con admin token deve creare uno
//        State con project=NULL.
//     2. GET stesso endpoint deve includere lo state appena creato.
//     3. PATCH /workspaces/<slug>/states/<id>/ con name nuovo deve aggiornare.
//     4. DELETE deve restituire 400 se ci sono issue che usano lo state,
//        204 altrimenti.
//
// v1.20a: Workspace-level shared states (Opzione 3) - backend schema.
//   STEP 1 di 4 della milestone v1.20.
//   - state.py model patch: State.project diventa NULLABLE per supportare
//     state "shared" a livello workspace. State NON eredita piu' da
//     ProjectBaseModel (che ha project NOT NULL); definisce esplicitamente
//     project (FK NULL, related_name="project_state" preservato per
//     bgtasks/workspace_seed_task.py) e workspace (FK NOT NULL,
//     related_name="workspace_state").
//   - Constraint refactor: rimosso unique_together legacy + il vecchio
//     name="state_unique_name_project_when_deleted_at_null". Aggiunti due
//     UniqueConstraint condizionali:
//       state_unique_name_project_when_active:
//         UNIQUE(name, project) WHERE deleted_at IS NULL AND project IS NOT NULL
//       state_unique_name_workspace_shared_when_active:
//         UNIQUE(name, workspace) WHERE deleted_at IS NULL AND project IS NULL
//   - Migration 0122_v120a_workspace_level_states: AlterField project
//     nullable, RemoveConstraint legacy, AlterUniqueTogether vuoto,
//     AddConstraint x 2. Nessun dato esistente toccato.
//   - State.save() override: se project_id NULL il caller DEVE passare
//     workspace esplicito (errore esplicito altrimenti). Sequence
//     calcolata fra states dello stesso scope (project o shared).
//   - project/base.py patch: alla creazione di un nuovo progetto,
//     controlla se esistono State con project=NULL e workspace=questo;
//     se SI, NON crea i 6 hardcoded DEFAULT_STATES (il progetto usera'
//     gli shared states). Se NO, comportamento stock (back-compat per
//     workspace pre-v1.20a).
//   - Issue.state_id: FK invariata, puo' puntare sia a project state
//     che a workspace shared state. Niente migration dati richiesta.
//
//   Cosa NON fa v1.20a:
//   - API endpoints CRUD per workspace states (-> v1.20b).
//   - Frontend store / service / dropdown integration (-> v1.20c).
//   - UI Workspace Settings + Project Settings toggle (-> v1.20d).
//
//   Verifica build:
//     1. `docker compose ... up -d migrator` deve riuscire (migration
//        0122 applica senza errori).
//     2. Creazione di un workspace nuovo + progetto: deve creare i 6
//        default state (back-compat: nessun shared state esiste ancora).
//     3. Manualmente via Django shell:
//        `State.objects.create(name='Test', workspace=ws, project=None)`
//        deve avere successo.
//
// v1.19c: People page - interattivita' completa (stile spreadsheet).
//   Riscritta la People page (patches/people-page.tsx) per rendere CLICCABILI
//   e MODIFICABILI inline tutti i campi dei task mostrati nella tree view.
//   Elementi:
//     - Avatar membro: componente stock @plane/propel Avatar (showTooltip).
//     - Counter "Active" e "Overdue" sulla summary row: <button> che filtra
//       la tree mostrando solo i task corrispondenti (click di nuovo = reset).
//     - Chip state-group (B/U/S/C/X) e chip timing (overdue/dw/nd): stessa
//       semantica, diventano <FilterChip> togglabili.
//     - Task identifier + nome: <button> che apre il peek-overview via
//       useIssuePeekOverviewRedirection (come spreadsheet/issue-row.tsx)
//       costruendo un TIssue sintetico {id, project_id, sequence_id,
//       archived_at:null}.
//     - Colonne State, Priority, Start, Due, Assignees: dropdown stock
//       (StateDropdown, PriorityDropdown, DateDropdown x2, MemberDropdown
//       multiple). onChange -> IssueService.patchIssue -> mutate(swrKey)
//       per rinfrescare la lista di quel membro.
//     - Layout: grid 6 colonne sticky-header, bordi sottili, hover bg
//       layer-1, stile allineato al spreadsheet stock.
//   Nota: il backend /members/<id>/issues/ ritorna solo task attivi
//   (backlog/unstarted/started). Se l'utente cambia stato in completed/
//   cancelled il task sparisce dalla lista dopo il refresh SWR: comportamento
//   voluto, coerente con "active only" della tree.
//
// v1.19b: Team dashboard - People page redesign.
//   Sostituito il layout a card con una LISTA/TABELLA di righe (una per
//   membro) con colonne: chevron | avatar | nome+ruolo+email | active |
//   overdue | breakdown state-group (chip inline) | breakdown timing
//   (chip inline). Click sulla riga espande mostrando l'albero dei task
//   attivi del membro con indent progressivo per subtask (parent_id -> tree
//   lato client). Lazy-load via SWR per ogni membro: la fetch parte al
//   primo expand e resta in cache.
//   Backend aggiunto: GET /api/workspaces/<slug>/members/<uuid:user_id>/issues/
//   (team_issues.py). Ritorna lista flat di task attivi (backlog/unstarted/
//   started) con parent_id, project identifier+name, state {name,group,color},
//   priority, start_date, target_date, assignee_ids, sequence_id.
//   Frontend: PeopleStatsService.fetchMemberIssues(slug, userId) +
//   refactor people-page.tsx in MemberRow con tree view.
//
// v1.19: Team dashboard - frontend People page.
//   Nuova rotta /:workspaceSlug/people registrata in routes/core.ts con
//   layout dedicato (people/layout.tsx), header (people/header.tsx), e
//   page (people/page.tsx).
//   Voce "people" aggiunta al sidebar come pinned static (sotto Projects),
//   accessibile a ADMIN e MEMBER. Icona Users da lucide-react aggiunta al
//   getSidebarNavigationItemIcon switch. RESTRICTED_URLS += "people" per
//   prevenire conflitti con slug progetti.
//   La page consuma GET /api/workspaces/<slug>/members/stats/ via un
//   servizio dedicato (PeopleStatsService). Rende una card per ogni membro
//   con: avatar, nome, email, badge ruolo, conteggi per state_group
//   (backlog/unstarted/started/completed/cancelled), conteggi temporali
//   (overdue, due_this_week, no_target_date). Ordinamento alfabetico lato
//   backend (v1.18). In testa: totale membri, total_active aggregato,
//   total_overdue aggregato.
//
// v1.18: Team dashboard - backend endpoint aggregato.
//   Nuovo file api/views/workspace/team_stats.py con
//   WorkspaceMembersStatsEndpoint registrato su
//     GET /api/workspaces/<slug>/members/stats/
//   Ritorna per ogni membro attivo: totali per state_group (backlog,
//   unstarted, started, completed, cancelled), total_active, overdue,
//   due_this_week, no_target_date. Ordinato alfabeticamente sul
//   display_name (case-insensitive). Guest inclusi (role=5).
//   Access-control: scope-workspace, solo issue di progetti dove il
//   requesting user e' membro attivo.
//   Frontend consumer: People page in v1.19.
//
// v1.17: FULL filter/display parity per my_issues (workspace views) e
//   profile_issues (your work) con `issues` (project). Dopo il primo pass
//   parziale, Ciro ha mostrato gli screenshot dei project views chiedendo
//   TUTTI i filtri e le opzioni di display anche a scope workspace/profile.
//
// my_issues.filters (stock 9 -> 13):
//   + state_id, mention_id, cycle_id, module_id
//   (restano subscriber_id, project_id utili workspace-wide)
// my_issues.list.group_by / kanban.group_by / kanban.sub_group_by:
//   + state, assignees, created_by (tutti workspace-safe via layouts-utils v1.07)
//   - NON aggiunti cycle/module: getCycleColumns/getModuleColumns dipendono
//     da currentProjectDetails -> empty columns a workspace scope.
// my_issues.list/kanban.order_by += target_date (parity issues.*)
// my_issues.kanban.extra_options.values += sub_issue
// my_issues.spreadsheet.order_by: da [] a lista standard
//
// profile_issues.filters (stock 8 -> 11):
//   + state_id, mention_id, subscriber_id (omesso assignee_id: profile e'
//     gia' self-filtered; omesso project_id per ridurre rumore)
// profile_issues.list.group_by / kanban.group_by / kanban.sub_group_by:
//   + state, created_by (omesso "assignees" per stessa ragione)
// profile_issues.list/kanban.order_by += target_date
// profile_issues.kanban.extra_options.values += sub_issue
//
// Il backend grouper.py gia' gestisce state_id, state__group, priority,
// labels__id, assignees__id, cycle_id, issue_module__module_id, created_by,
// project_id come group_by nativi (v1.15 backend patch lo ha reso valido
// anche per WorkspaceViewIssuesViewSet).
//
// v1.16: FIX Calendar workspace - rimossa fetchIssues redundante di
// AllIssueLayoutRoot. La SWR root faceva una fetchIssues flat (per_page=100,
// canGroup:false) che vinceva la race contro la fetch grouped di
// BaseCalendarRoot (groupedBy:target_date, perPage:4, before/after) ->
// calendario vuoto. Il log diagnostico v1.13 ha confermato:
//   seq 4  -> fetch A (Calendar): group_by=target_date, per_page=4
//   seq 15 -> fetch B (SWR root): per_page=100, nessun group_by
//   seq 19 -> layout renders con 5 issue piatte (risposta di B)
// Kanban non era affetto: anche con risposta flat, lo store bucketta lato client
// sullo state__group che ogni issue ha nel record. Il Calendar invece dipende
// dal bucketing SERVER-side (date come chiavi) e quindi collassa.
// Fix v1.16: la SWR di AllIssueLayoutRoot fa solo fetchFilters. Ogni base root
// di layout si occupa gia' della propria fetchIssues con le opzioni corrette.
//
// v1.15: FIX BACKEND - WorkspaceViewIssuesViewSet applica group_by server-side.
// La diagnostica v1.14 ha mostrato che il frontend inviava group_by=state__group
// ma il backend rispondeva comunque con grouped_by: null, results: array[5]:
// il viewset Django delle workspace views (view/base.py) semplicemente NON
// leggeva group_by e NON applicava bucketing. La Kanban di "Your Work" invece
// funziona perche' usa WorkspaceUserProfileIssuesEndpoint (workspace/user.py)
// che da sempre applica issue_queryset_grouper + issue_on_results +
// issue_group_values + GroupedOffsetPaginator.
// Fix v1.15: portato quel pattern dentro WorkspaceViewIssuesViewSet.list().
// - Se group_by e' nella query string -> nuovo percorso con GroupedOffsetPaginator
//   (o SubGroupedOffsetPaginator se anche sub_group_by e' presente)
// - Se group_by e' assente -> percorso stock invariato (ViewIssueListSerializer)
//   cosi' List/Spreadsheet/Gantt (senza grouping) non cambiano comportamento.
// Build: aggiunta build immagine plane-api-custom con plane/app/views/view/base.py
// patchato; docker-compose.override.yml ora sovrascrive anche api, worker,
// beat-worker e migrator per garantire consistenza del codice Django.
//
// v1.14: Fix augmentation group_by da "state" a "state_detail.group".
// Il frontend mandava state_id al backend ma il grouping restava disattivato
// perche' "state" non era nell'elenco allowed di kanban.display_filters
// (my_issues.kanban.group_by = state_detail.group/priority/project/labels).
// Questo fix era CORRETTO ma insufficiente: anche con state_detail.group
// nella query string, il backend view/base.py ignorava il parametro.
// Risolto in v1.15 lato backend.
//
// v1.13: Diagnostica massiva file-based.
// La Workspace Kanban resta bianca anche col root-clone di Profile (v1.12).
// Non sappiamo dove si rompe: fetch fallisce? IssueLayoutHOC decide loader?
// getGroupByColumns torna undefined? groupedIssueIds resta vuoto? Senza
// console del browser e' impossibile triangolare. Soluzione:
//   1) Node HTTP server in plane-custom/diagnostic-server.js su :9999,
//      POST /log appende JSON a diagnostic.log (Claude puo' leggere).
//   2) Modulo diagnostic-logger.ts in @/lib/ che esporta dlog(cat,msg,data)
//      -> fetch al server + console.info, keepalive, fail-safe.
//   3) Tracce in base-kanban-root, issue-layout-HOC, workspace-filter-store,
//      layouts-utils (getStateColumns/getGroupByColumns) e kanban-default
//      (early return null vs render). Ogni passaggio chiave e' loggato.
//   4) Workflow: Ciro lancia `node diagnostic-server.js`, rebuilda,
//      apre la Kanban in Workspace Views, Claude legge diagnostic.log.
//
// v1.12: Workspace Kanban -> clone 1:1 di profile-issues-root.tsx (stock).
// v1.11 aveva clonato project-root che NON passa viewId; lo store GLOBAL
// senza viewId non sa quale vista fetchare -> groupedIssueIds resta vuoto
// -> Kanban bianca. Profile e' scope workspace-level come GLOBAL e passa
// viewId (profileViewId): qui usiamo globalViewId. Stesso pattern minimale
// (~30 righe), nessun hook diagnostico.
//
// v1.11: Workspace Kanban -> clone 1:1 di project-root.tsx (stock).
// Le versioni precedenti del root workspace avevano accumulato rumore che
// non compariva ne' in project-root ne' in profile-issues-root
// (useWorkspaceIssueProperties, useIssues diagnostico, useEffect tracing,
// passaggio di viewId a BaseKanBanRoot). Ora torniamo al pattern minimale:
// ~30 righe come project-root. Se Project Kanban funziona, questo deve
// funzionare identicamente.
//
// v1.10: FIX DEL CASCADE (Kanban rompe List nel Workspace).
// Root cause: workspace-filter-store.ts scriveva group_by="state" nel
// displayFilters CONDIVISO quando l'utente apriva Kanban (sia in
// fetchFilters che in updateFilters). Quando tornava su List, group_by
// era ancora "state" -> getGroupByColumns cercava state columns ->
// workspaceStates non sempre pronti -> List default.tsx faceva
// `if (!groups) return null` -> schermo bianco anche per List.
// Fix Profile-aligned (Profile/Your Work gia' funziona perche' usa un
// default "state" da constants-issue-filter.ts, non una mutazione
// reattiva al cambio layout):
//   1) Rimosso write di group_by="state" in fetchFilters + updateFilters.
//   2) getIssueFilters ora ritorna una VISTA AUGMENTATA (non-mutating)
//      con group_by="state" solo quando layout=KANBAN e l'utente non ha
//      scelto un group_by. Al ritorno su List, layout != kanban -> vista
//      non-augmentata -> group_by resta undefined -> ALL_ISSUES bucket ->
//      List continua a funzionare.
// Rimossi dal build: kanban-default.tsx e list-default.tsx (erano solo
// diagnostica v1.09, non risolvevano nulla).
//
// v1.08: fix cascade-failure layout switch (Kanban -> List blank screen).
// Le fetchIssues / fetchNextIssues / fetchIssuesWithExistingPagination
// erano fire-and-forget: quando la fetch precedente veniva abortita al
// cambio di layout, workspace.service trasformava AbortError in `throw
// undefined`. Ora tutti i 5 base root + il global-view.store hanno
// ?.catch(swallowAbort).
//
// v1.07: fix getStateColumns / getCreatedByColumns per scope workspace.
// In workspace views i group_by "state" e "created_by" ora usano
// workspaceStates / workspaceMemberIds (prima ricadevano su projectStates
// undefined -> List/KanBan default.tsx restituivano null -> schermo BIANCO).
const CUSTOM_PATCH_TAG = "PATCHED v1.20b";

export const WorkspaceEditionBadge = observer(function WorkspaceEditionBadge() {
  // states
  const [isPaidPlanPurchaseModalOpen, setIsPaidPlanPurchaseModalOpen] = useState(false);
  // translation
  const { t } = useTranslation();
  // platform
  const { isMobile } = usePlatformOS();

  return (
    <>
      <PaidPlanUpgradeModal
        isOpen={isPaidPlanPurchaseModalOpen}
        handleClose={() => setIsPaidPlanPurchaseModalOpen(false)}
      />
      <div className="flex items-center gap-2">
        <Tooltip tooltipContent={`Version: v${packageJson.version} (${CUSTOM_PATCH_TAG})`} isMobile={isMobile}>
          <Button
            variant="tertiary"
            size="lg"
            onClick={() => setIsPaidPlanPurchaseModalOpen(true)}
            aria-haspopup="dialog"
            aria-label={t("aria_labels.projects_sidebar.edition_badge")}
          >
            Community
          </Button>
        </Tooltip>
        <span
          title={`Build custom attiva - ${CUSTOM_PATCH_TAG}`}
          className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/40 select-none"
        >
          {CUSTOM_PATCH_TAG}
        </span>
      </div>
    </>
  );
});
