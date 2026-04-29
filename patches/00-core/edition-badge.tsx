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
// Se vedi questo badge "PATCHED v1.23" accanto a "Community", oltre alle
// feature delle versioni precedenti il quick-add inline funziona ora anche
// in Workspace Views, Your Work, Calendar workspace.
//
// v1.27b hotfix: bulk operations endpoint 404.
//   `IssueService.bulkOperations()` chiama
//     POST /api/workspaces/<slug>/projects/<projectId>/bulk-operation-issues/
//   Endpoint che NON esiste in CE (e' paid in Plane One). Risultato:
//   ogni Set state/priority/assignees -> 404 "Page not found".
//   Fix: invece di chiamare l'endpoint batch, faccio loop con
//   `patchIssue` (endpoint singolo /projects/<projectId>/issues/<id>/)
//   per ogni task selezionato. Promise.allSettled cosi' un fallimento
//   non blocca gli altri. Toast riassuntivo (success/partial/failure).
//   Costo: piu' chiamate HTTP per N task, ma compatibile con CE.
//
// v1.30 hotfix #2: duplicate work item nel WeeklyCalendar e KPI gonfiati.
//   Causa: il queryset base in /me/dashboard/ filtra `assignees=target_user`
//   (M2M JOIN tramite IssueAssignee). Senza .distinct(), se ci sono righe
//   IssueAssignee soft-deleted oltre a quella attiva (default manager
//   include entrambe), una stessa issue compare N volte. Sintomo: 3 task
//   identici nel calendario, KPI assigned/overdue gonfiati.
//   Fix: aggiunto .distinct() al base queryset. Tutti i sub-queryset
//   (today, overdue, week) e count derivano da base, quindi una sola
//   modifica sistema sia liste che count.
//
// v1.30 hotfix: timezone shift nel WeeklyCalendar.
//   `Date#toISOString()` ritorna UTC. In fuso orario non-UTC (es.
//   Europe/Rome UTC+2) il giorno locale alla mezzanotte e' il giorno
//   precedente in UTC -> i 7 giorni della griglia avevano `iso` shiftato
//   di -1 vs il label visualizzato. Risultato: task con target_date ieri
//   compariva nella colonna "oggi" perche' iso match. Fix: costruiamo
//   "YYYY-MM-DD" localmente con getFullYear/getMonth/getDate.
//
// v1.30: Mini-calendario settimanale nella MyDashboard.
//   - Backend (api-dashboard-view.py): endpoint /me/dashboard/ esteso con
//     `week_issues` (tutti i task con target_date in [Lun, Dom] della
//     settimana corrente, active state group, cap a 100) e `week_range`
//     {monday, sunday}. Cap protegge payload se molti task.
//   - Frontend (dashboard-service.ts): TDashboardResponse esteso con i
//     nuovi campi.
//   - Frontend (my-dashboard.tsx): nuovo componente <WeeklyCalendar/>
//     inserito sotto le 4 KPI cards. 7 colonne (Lun-Dom), ogni colonna
//     mostra task target_date di quel giorno (max 5 visibili + "+N more").
//     Click su un task -> peek-overview. Colonna oggi evidenziata in
//     accent color.
//
//   Verifica build:
//     1. Vai su /<slug>/ (home). Sotto le 4 KPI cards vedi una tabella
//        a 7 colonne con i giorni della settimana corrente.
//     2. Task con target_date in un giorno visibile -> compaiono nella
//        colonna giusta.
//     3. Colonna "oggi" evidenziata. Click su un task -> peek si apre.
//     4. Se hai >5 task in un giorno, vedi "+N more".
//
// v1.23d hotfix: Gantt drag click leak.
//   In Gantt, dopo drag, il browser inviava un click event al rilascio
//   del mouse -> peek-overview si apriva al termine di ogni drag.
//   Fix: in apps/web/core/components/issues/issue-layouts/gantt/blocks.tsx
//   tracciamo la posizione del mouse al mousedown e calcoliamo la
//   distanza al click. Se > 5px, era drag -> ignoro l'apertura del peek.
//   Se <= 5px, era click vero -> apro peek normalmente.
//   Patch applicata solo al `IssueGanttBlock` (barra). `IssueGanttSidebarBlock`
//   (sidebar) non e' draggable, invariato.
//
// v1.29: TENTATIVO RITIRATO (ROLLBACK).
//   Avevo sbloccato isMovePageEnabled e isPageSharingEnabled cambiando
//   ce/hooks/use-page-flag.ts a {true, true}. La voce di menu "Move page"
//   doveva comparire MA il MovePageModal in apps/web/ce/components/pages/
//   modals/move-page-modal.tsx e' uno stub `return null`. PageShareControl
//   e PageMoveControl in ce/components/pages/header/ idem. Era Pattern A
//   travestito da Pattern B: il flag controllava solo la visibilita' del
//   menu, non sbloccava codice esistente. Rollback: hook resta `{false,
//   false}` come stock.
//
//   Per avere queste feature serve riscrivere da zero MovePageModal +
//   header controls + verificare endpoint backend per page sharing
//   pubblico. Costo: ~1 giornata. Rinviato (non operativamente critico).
//
// v1.23c+ hotfix bundle:
//   - Gantt drag persistence in workspace context (vedi sotto).
//   - MoveIssueModal z-index + stopPropagation: era z-20, sotto il peek-
//     overview (z-30+). Cliccando il modale chiudeva il peek + il modale
//     stesso. Alzato a z-[60]. Plus stopPropagation sul Dialog.Panel
//     perche' anche con z-index alto il click DENTRO il modale veniva
//     ricevuto dall'outside-click detector del peek (event bubble) ->
//     peek chiuso -> modale unmounted. Lo bloccchiamo a livello DOM.
//   - useMoveIssue cleanup post-move: dopo move, oltre a removeIssue
//     dalla mappa globale, rimuovo anche dai groupedIssueIds di tutti
//     gli store types (best-effort) e chiudo il peek-overview se aperto
//     sul task spostato. Senza, in Gantt restava una "riga fantasma"
//     vuota selezionata + pannello peek bianco.
//     hotfix3: ordine critico. removeIssueFromList(id) lookup-a l'issue
//     da rootIssueStore.issues.getIssueById(id) e poi chiama
//     updateIssueList con quell'issue come "before". Se removiamo prima
//     dall'issueMap globale, il lookup fallisce e la riga resta nei
//     grouped lists. Ordine corretto: PRIMA grouped, POI globale.
//   - BulkActionBar z-index: era z-[2], i dropdown (Set state/priority/
//     assignees) erano coperti dalle righe della lista. Alzato a z-[40].
//
// v1.23c hotfix: Gantt drag persistence in workspace context.
//   In base-gantt-root.tsx riga 125, updateBlockDates esce con
//     Promise.resolve()
//   se !projectId URL. In workspace views/your-work il drag aggiornava
//   ottimisticamente ma niente API call -> al refresh i task tornavano
//   alla posizione iniziale. Fix: in workspace context, loop su updates
//   chiamando updateIssue(issue.project_id, ...) per ogni task. Il
//   project_id viene ricavato dall'issue stessa (issueMap lookup).
//   Stesso pattern v1.23a/b: sblocco gate `!projectId` per workspace.
//
//   Verifica build:
//     1. Workspace views in Gantt: drag un task -> al rilascio resta
//        nella nuova posizione (toast nessuno = OK).
//     2. Drag estremita' (resize handle) -> stessa cosa, persiste.
//     3. Project views in Gantt: stesso comportamento di prima (usa
//        l'endpoint batch stock /issue-dates/).
//
// v1.27c: multi-select in Spreadsheet layout.
//   - apps/web/core/components/issues/issue-layouts/spreadsheet/issue-row.tsx
//     (full replacement): stesso fix di v1.27a su list/block.tsx ma per
//     Spreadsheet. Rimosso il gate `projectId &&` davanti al checkbox.
//
//   La barra azioni appare automaticamente: spreadsheet-view.tsx renderizza
//   gia' <IssueBulkOperationsRoot> (riga 124), che con v1.27a e' la nostra
//   BulkActionBar. Cosi' tutti i 6 pulsanti (state, priority, assignee,
//   move, archive, delete) sono disponibili anche in Spreadsheet.
//
//   Calendar/Kanban/Gantt: layout con block non lineari, multi-select
//   richiederebbe UX dedicata (long-press / shift+click). Rinviato.
//
//   Verifica build:
//     1. /<slug>/projects/<projectId>/issues/ in Spreadsheet: hover su
//        una riga -> checkbox compare a sinistra del titolo.
//     2. Click su checkbox -> task selezionato, riga evidenziata.
//     3. Bottom bar appare con tutti i 6 pulsanti.
//     4. Stesso comportamento su /<slug>/workspace-views/<viewId> in
//        Spreadsheet.
//
// v1.28: Export CSV dei task della view corrente.
//   - export-csv-button.tsx (nuovo): componente riusabile parametrizzato
//     per storeType e contextLabel. Estrae gli ID dal groupedIssueIds
//     (flat o subgrouped), recupera i dettagli da issueMap + project +
//     state + member stores, costruisce CSV con escape proprio (virgole,
//     virgolette, newline) e BOM UTF-8 per Excel. Trigger download via
//     blob + anchor.tag.click().
//   - workspace-views-header.tsx (modificato v1.22d): aggiunto pulsante
//     Export accanto a Display.
//
//   Limitazione MVP: esporta solo i task gia' caricati nel cache (rispetta
//   filtri server-side ma e' paginato). Per export full unpaginated serve
//   endpoint backend dedicato.
//
//   Cosa NON fa v1.28:
//   - XLSX (richiede SheetJS, rinviato).
//   - Export su project views, your-work (rinviato — copertura solo
//     workspace-views per ora).
//   - Custom columns picker (set fisso di colonne).
//
//   Verifica build:
//     1. /<slug>/workspace-views/<viewId>: nell'header accanto a Display
//        c'e' un pulsante "Export" con icona download.
//     2. Click -> download immediato di <slug>-workspace-views-<YYYYMMDD>.csv
//        con tutti i task della view corrente.
//     3. Apri il CSV in Excel/Numbers: 11 colonne (Identifier, Title, State,
//        Priority, Assignees, Start date, Target date, Project, Labels,
//        Created by, Created at). Accenti corretti grazie al BOM UTF-8.
//
// v1.27b: Bulk actions estese (state, priority, assignee, move to project).
//   - bulk-action-bar.tsx: aggiunti 4 dropdown/pulsanti stock-driven.
//     * StateDropdown (project-scoped): visibile solo se tutti i task
//       selezionati sono dello stesso project. In multi-project mostra un
//       pulsante disabled con tooltip esplicativo.
//     * PriorityDropdown: enum globale, sempre attivo.
//     * MemberDropdown multiple: assignee picker. projectId passato solo se
//       same project, altrimenti workspace-wide member list.
//     * Move button: apre BulkMoveIssueModal.
//   - bulk-move-issue-modal.tsx (nuovo): variante bulk del v1.24c.
//     Promise.allSettled cosi' un fallimento non blocca gli altri. Toast
//     riassuntivo finale (success / partial / failure).
//
//   Backend: bulkOperations stock per state/priority/assignee. Endpoint
//   stock /api/workspaces/<slug>/projects/<projectId>/bulk-operation-issues/.
//   Group by project_id come per archive/delete.
//
//   Verifica build:
//     1. Seleziona >0 task: la barra ora ha 4 controlli in piu' (Set state,
//        Set priority, Set assignees, Move).
//     2. Stesso project: Set state attivo. Multi project: Set state grigio
//        con tooltip "Same project required".
//     3. Set priority Urgent -> tutti i selezionati passano a Urgent.
//     4. Set assignees -> aggiungi 1 membro -> tutti i selezionati ricevono
//        quel assignee (existing assignees sostituiti).
//     5. Move -> seleziona target project -> tutti i task vengono spostati
//        (con nuovo identifier). Toast riassuntivo.
//
// v1.27a: Bulk actions MVP (selection + archive + delete in List layout).
//   Plane stock ha gia' un sistema multi-select (MultipleSelectEntityAction
//   + useMultipleSelectStore + selectionHelpers) ma la barra di azioni
//   reale e' una feature paid: la CE (Community Edition) renderizza solo
//   un upgrade banner "Upgrade to Plane One".
//
//   Patch:
//   - apps/web/core/components/issues/bulk-operations/bulk-action-bar.tsx
//     (nuovo): vera barra fixed in basso, riusa useMultipleSelectStore
//     stock e selectionHelpers. Archive + Delete con dialog di conferma.
//     Group by project_id per supportare bulk in workspace views (gli
//     endpoint stock bulkArchiveIssues/bulkDeleteIssues sono scoped per
//     project, quindi chiamiamo in parallelo).
//   - apps/web/ce/components/issues/bulk-operations/root.tsx: sostituito
//     il render del BulkOperationsUpgradeBanner con BulkActionBar.
//   - apps/web/core/components/issues/issue-layouts/list/block.tsx:
//     rimosso il gate `projectId &&` davanti al checkbox di selezione,
//     cosi' compare on-hover anche in workspace views/your-work. La
//     logica disabled si adatta al context (project vs workspace).
//
//   Cosa NON fa v1.27a:
//   - Bulk change state / priority / assignee -> v1.27b.
//   - Bulk move to project -> riusa v1.24 in loop (v1.27c).
//   - Multi-select in Spreadsheet/Kanban/Calendar/Gantt -> v1.27d.
//   - Shift+click range select -> nice to have, posticipato.
//
//   Verifica build:
//     1. /<slug>/projects/<projectId>/issues/ in List layout: hover su
//        un task -> appare il checkbox a sinistra. Click -> selezionato.
//     2. Selezionando >0 task: in fondo alla pagina compare la barra
//        "{N} selected" + Archive + Delete + X (clear).
//     3. Click Archive -> dialog conferma -> archive bulk -> task spariti
//        dalla view, toast success.
//     4. Click Delete -> dialog conferma "permanent" -> delete bulk -> task
//        spariti, toast success.
//     5. Stesso comportamento in workspace views (/<slug>/workspace-views/
//        <viewId>) e Your Work (/<slug>/profile/<myId>/...). Group by
//        project_id automatico per le chiamate API.
//
// v1.26: My Dashboard sopra la home workspace stock.
//   - apps/api/plane/app/views/workspace/dashboard.py (v1.26a, nuovo file):
//     endpoint GET /api/workspaces/<slug>/me/dashboard/?user_id=<uuid>.
//     Default = request.user. Per admin/member del workspace permette di
//     vedere la dashboard di altri utenti (passing user_id). Filtra "active"
//     state group (backlog/unstarted/started). Calcola KPI:
//       - total_assigned, due_today, overdue, due_this_week (today->sunday)
//     Restituisce anche top 5 today_issues (priority desc) e top 5
//     overdue_issues (target_date asc). Access-control: solo task di
//     project dove il REQUESTING user (non il target) e' membro attivo.
//   - apps/api/plane/app/urls/workspace.py: registra route.
//   - apps/web/core/services/dashboard.service.ts (v1.26b, nuovo): client.
//   - apps/web/core/hooks/use-my-dashboard.ts (v1.26b, nuovo): hook SWR
//     con refresh interval 60s.
//   - apps/web/core/components/home/my-dashboard.tsx (v1.26c, nuovo):
//     componente MyDashboard con hero greeting + avatar + (admin) dropdown
//     "View as: <user>", 4 KPI card (Assigned/Due today/Overdue/This week),
//     2 colonne Today/Overdue lists. Click su una row apre il peek-overview.
//   - apps/web/app/(all)/[workspaceSlug]/(projects)/page.tsx: inserisce
//     <MyDashboard/> SOPRA <WorkspaceHomeView/> stock (la home stock con
//     sticky/recents resta sotto scrollabile).
//
//   Cosa NON fa v1.26:
//   - Mini-calendario settimanale (rinviato).
//   - Recent activity feed (rinviato).
//   - Quick add task nella dashboard (usa il "+" sidebar).
//
//   Verifica build:
//     1. /<slug>/ -> in cima vedi la card "Good morning, <Name>" con avatar.
//     2. 4 KPI card con i numeri attesi (assigned, today, overdue, week).
//     3. Today list + Overdue list con i tuoi task. Click apre peek.
//     4. Se sei admin/member: dropdown "View as..." in alto a destra ->
//        scegli un altro utente -> vedi la sua dashboard (admin only).
//     5. La home stock (sticky, recents, ecc) e' ancora visibile sotto.
//
// v1.25: Move modal + project visualization + filter project su Your Work.
//   - move-issue-modal.tsx (v1.25a): include workspaceHiddenProjectId come
//     opzione target del picker. Stock joinedProjectIds lo filtra (v1.22b)
//     quindi lo concateno manualmente in allowedProjectIds. Sempre escluso
//     il current project del task.
//   - issue-identifier.tsx (v1.25b + v1.25c): aggiunto avatar/logo del
//     project PRIMA dell'IdentifierText. Una sola patch copre tutti i 5
//     layout + peek-overview + parent-select + relations + power-k. Per
//     size="md" (peek-overview e detail page tramite IssueTypeSwitcher)
//     aggiunge anche il NOME del project (es. "[icon] Oniro / O-10") cosi'
//     sull'header esteso si vede subito da quale project arriva il task.
//   - constants-issue-filter.ts (v1.25d): aggiunto project_id ai filters di
//     profile_issues (Your Work). my_issues lo aveva gia' da v1.17. group_by
//     "project" e' gia' presente in entrambi da v1.17.
//
//   Cosa NON fa v1.25:
//   - order_by "by project" lato backend: richiederebbe modifica del
//     queryset Django (server-side). Skip per ora; il group_by "project" e'
//     sufficiente per visualizzare task raggruppati per project.
//
//   Verifica build:
//     1. /<slug>/workspace-views/<viewId>: ogni task ha l'avatar del
//        project prima dell'identifier (es. icona + "O-10"). Hover ->
//        tooltip con nome project.
//     2. Apri un task in peek o full-screen: in alto vedi
//        "[icon] Oniro / O-10" prima del titolo.
//     3. Apri il kebab di un task del workspace project -> Move to project
//        -> il dropdown ora include anche "Workspace" (oltre ai project
//        reali).
//     4. /<slug>/profile/<myId>/assigned: nei filter del display c'e'
//        ora "Project" come dimensione di filtraggio.
//
// v1.24c: UI Move work item (modal + voce nei kebab menu).
//   - apps/web/core/components/issues/move-issue-modal.tsx (nuovo file):
//     dialog con project picker (escluso il current), toggle "Include
//     sub-issues" (default ON, conta i sub se disponibili), preview testuale
//     dei campi che verranno resettati (labels, cycle, module, state, ...).
//   - quick-action-dropdowns/helper.tsx: aggiunta factory
//     createMoveMenuItem() integrata in useProjectIssueMenuItems,
//     useAllIssueMenuItems, useCycleIssueMenuItems, useModuleIssueMenuItems,
//     useWorkItemDetailMenuItems. La voce e' visibile solo se il caller
//     ha passato setMoveIssueModalOpen.
//   - all-issue.tsx, project-issue.tsx, issue-detail.tsx (full replacement):
//     state locale moveIssueModalOpen + render del MoveIssueModal +
//     pass setMoveIssueModalOpen ai menuItemProps. Cycle/module quick
//     actions skip (l'use case principale e' coperto: workspace + project).
//
//   Verifica build:
//     1. Apri qualsiasi task in workspace views o project view -> kebab
//        menu -> voce "Move to project" presente.
//     2. Click -> modal "Move work item" con dropdown project (escluso il
//        current), toggle "Include N sub-issues" (se >0), preview reset,
//        Cancel/Move buttons.
//     3. Seleziona target -> Move -> task scompare dalla view corrente
//        (cleanup ottimistico) -> toast success con pulsante "View" che
//        naviga al task nel nuovo project con nuovo identifier.
//     4. Stesso comportamento dal peek-overview kebab.
//
//   Cosa NON fa v1.24c:
//   - Voce nel kebab di cycle/module quick actions (skip per scope).
//   - Activity log ("Moved from X to Y") nel feed del task: skip.
//   - UI per "drag to project" (drag a Sidebar Project) - nice to have.
//
// v1.24b: frontend service + hook per Move issue.
//   - apps/web/core/services/issue-move.service.ts (nuovo): IssueMoveService.
//   - apps/web/core/hooks/use-move-issue.tsx (nuovo): useMoveIssue() hook.
//     Orchestra: API call -> rimuove issue dalla cache (rootStore.issue.
//     issues.removeIssue) -> toast success con pulsante "View" che porta
//     al nuovo project. Cleanup cache best-effort: errori non bloccanti.
//
// v1.24a: backend Move issue across projects.
//   Endpoint POST /api/workspaces/<slug>/issues/<issue_id>/move/
//   Body: {target_project_id, include_sub_issues}
//   - apps/api/plane/app/views/workspace/issue_move.py (nuovo file).
//   - apps/api/plane/app/urls/workspace.py: registra route.
//
//   Logica:
//   - transaction.atomic + select_for_update sull'issue principale.
//   - Permission: ADMIN/MEMBER del workspace + member del target project.
//   - Smart state mapping: name+group match nel target -> fallback default
//     state -> primo state per sequence.
//   - Filter assignees ai member del target project (rimuove non-member).
//   - Reset parent_id se cross-project.
//   - Genera sequence_id col pattern stock (advisory_xact_lock postgres).
//   - DELETE IssueSequence vecchia + INSERT nuova nel target.
//   - UPDATE project_id (e workspace_id) su tabelle correlate:
//     IssueAssignee, IssueLink, IssueAttachment, IssueActivity, IssueComment,
//     IssueSubscriber, IssueReaction, IssueMention, IssueVersion,
//     IssueDescriptionVersion, IssueBlocker (entrambi i lati),
//     IssueRelation (entrambi i lati).
//   - DELETE CycleIssue, ModuleIssue, IssueLabel (project-scoped).
//   - Se include_sub_issues=true: ricorsivo su sub-issue (con lock proprio).
//
//   Cosa NON fa v1.24a:
//   - Frontend service / store / UI -> v1.24b + v1.24c.
//   - Activity log entry per il move (potrebbe essere aggiunto come
//     "moved from project X to Y" - skip per ora).
//
//   Verifica build:
//     - curl POST /api/workspaces/oniro/issues/<id>/move/ con body
//       {target_project_id: <other-project>} deve ritornare 200 + issue
//       con nuovo sequence_id, project_id, state_id.
//     - Verificare che le tabelle correlate (IssueAssignee, ecc) abbiano
//       project_id aggiornato. CycleIssue, ModuleIssue, IssueLabel
//       cancellate.
//     - GET /api/workspaces/oniro/projects/<old-project>/issues/<id>/
//       deve restituire 404 (l'issue ora e' nel nuovo project).
//
// v1.23b (hotfix #2): Calendar quick-add hover su celle.
//   Stock calendar/quick-add-issue-actions.tsx riga 82 ha
//     if (!projectId) return null;
//   che bloccava il menu hover "+" sulle celle del calendar in workspace
//   context. Patch:
//   - Rimosso il return null. Il QuickAddIssueRoot child gia' gestisce il
//     fallback workspaceHiddenProjectId (patch v1.23).
//   - Menu item "Add existing" nascosto in workspace context (richiede un
//     projectId per filtrare).
//   In project context tutto resta identico allo stock.
//
// v1.23a (hotfix): isEditingAllowed con WORKSPACE level fallback nei 5
//   base-root quando l'URL non porta projectId. Senza, il quick-add restava
//   filtrato a monte: list-group/kanban-group/calendar/gantt/spreadsheet
//   filtrano `!disableIssueCreation` dove disableIssueCreation =
//   isEditingAllowed === false. allowPermissions(...PROJECT) ritorna false
//   se non c'e' projectId nello store router -> il quick-add v1.23 non
//   diventava mai visibile in workspace views/Your Work.
//   Fix: nei 5 base-root scegliamo dinamicamente il level
//     `projectId ? PROJECT : WORKSPACE`
//   cosi' la check passa anche in workspace context.
//
// v1.23: quick-add inline su workspace views + Your Work.
//   Il sistema stock di quick-add (apps/web/core/components/issues/
//   issue-layouts/quick-add/) era completo per project views ma escluso
//   da workspace views e profile per 3 ragioni:
//     a) QuickAddIssueRoot esce con `if (!projectId) return null` perche'
//        legge solo URL (assenti workspace context).
//     b) WorkspaceIssues e ProfileIssues store hanno `quickAddIssue =
//        undefined` esplicito per disabilitare il quick-add.
//     c) useGlobalIssueActions e useProfileIssueActions non espongono
//        quickAddIssue.
//
//   Patch:
//     - quick-add/root.tsx: resolvedProjectId = URL ?? prePopulatedData
//       ?? workspaceHiddenProjectId. Lazy fetch via useWorkspaceProject().
//     - workspace/issue.store.ts: quickAddIssue = this.issueQuickAdd
//       (la logica e' gia' in BaseIssuesStore).
//     - profile/issue.store.ts: enableQuickAdd:true su assigned/created
//       (subscribed off) + quickAddIssue = this.issueQuickAdd.
//     - hooks/use-issues-actions.tsx: nuovo quickAddIssue in
//       useGlobalIssueActions + useProfileIssueActions. Profile/assigned
//       auto-aggiunge userId a assignee_ids per non perdere il task dal
//       filtro server-side.
//
//   Default project per quick-add in workspace context: il "Workspace"
//   project fittizio (workspaceHiddenProjectId). Se l'utente vuole
//   scegliere un project specifico, usa il pulsante "+ Add work item"
//   v1.22d (apre modal completo con picker).
//
//   Verifica build:
//     1. /<slug>/workspace-views/<viewId> in Calendar layout: hover su
//        una cella vuota -> appare il pulsante "+", click -> input inline.
//        Tipo titolo, Enter -> task creato col target_date di quella cella
//        e project_id = workspace project.
//     2. Stesso flusso in List, Kanban, Spreadsheet, Gantt workspace.
//     3. /<slug>/profile/<myId>/assigned: stesso pattern. Verifica che
//        il task creato sia auto-assegnato a current user (cosi' resta
//        visibile nella vista dopo il refresh).
//     4. /<slug>/profile/<myId>/subscribed: il pulsante quick-add NON
//        deve apparire (enableQuickAdd:false intenzionale).
//     5. Project views invariate: il quick-add deve continuare a
//        funzionare come prima.
//
//   Cosa NON fa v1.23:
//   - Move task fra progetti (es. da Workspace a un project reale): e'
//     v1.24 (richiesta esplicita di Ciro per gestire i quick-add nel
//     posto sbagliato). Backend endpoint + UI dedicata.
//
// v1.22e: marker visivo "Workspace task" su IssueIdentifier shared.
//   - apps/web/ce/components/issues/issue-details/issue-identifier.tsx
//     Componente shared importato dai 5 layout (list, kanban, calendar,
//     gantt, spreadsheet) + peek-overview + parent-select + relations +
//     power-k. Una sola patch copre l'intera UI.
//     * Confronto projectId vs useProject().workspaceHiddenProjectId.
//     * Se match: <Tooltip><Globe2/></Tooltip> dopo IdentifierText.
//     * Tooltip "Workspace task", icona text-tertiary per non rubare
//       attenzione al titolo. Dimensione 12-14px coerente con la size
//       prop dell'identifier.
//
//   Cosa NON fa v1.22e:
//   - Background row diverso per task workspace -> sarebbe troppo invasivo.
//   - Filtro "show only workspace tasks" / "hide workspace tasks" -> nice
//     to have, posticipato.
//
//   Verifica build:
//     1. Apri /<slug>/workspace-views/<viewId> in qualsiasi layout. Trova
//        un task del progetto Workspace (identifier WS-N): a destra del
//        codice "WS-42" deve comparire un'icona globo. Hover -> tooltip
//        "Workspace task".
//     2. Stesso comportamento in /<slug>/your-work/, /<slug>/people/
//        (tree espansa), peek overview di un task workspace.
//     3. Task di progetti normali NON mostrano l'icona.
//
// v1.22d: pulsante "+ Add work item" su pagine workspace-level dove
//   mancava completamente.
//   - apps/web/app/(all)/[workspaceSlug]/(projects)/people/header.tsx
//     Header.RightItem: <Button primary> "Add work item" che chiama
//     toggleCreateIssueModal(true, EIssuesStoreType.PROJECT, undefined).
//     Il modal globale (montato in WorkItemLevelModals al livello layout)
//     riceve allowedProjectIds=undefined e mostra tutti i project +
//     il "Workspace" project in cima (v1.22c).
//   - apps/web/app/(all)/[workspaceSlug]/(projects)/profile/[userId]/header.tsx
//     ("Your Work"): stesso pulsante in Header.RightItem accanto al
//     ProfileIssuesFilter.
//   - apps/web/app/(all)/[workspaceSlug]/(projects)/workspace-views/header.tsx
//     (Workspace Views): pulsante prima di "Add view" gia' esistente.
//   - apps/web/core/store/project/project.store.ts: aggiunto
//     workspaceHiddenProjectId all'INTERFACE IProjectStore (era solo
//     nella class implementation -> i consumer tipati non compilavano).
//
//   Permission gate: ADMIN/MEMBER del workspace (allowPermissions). Il
//   pulsante e' disabilitato se: non hai permessi, oppure non hai progetti
//   joined NE' un workspace project (caso edge).
//
//   Cosa NON fa v1.22d:
//   - URL alias /<slug>/work-items/<id> -> v1.22e (se serve).
//   - Visualizzazione marker "Workspace task" nelle viste -> nice to have,
//     posticipato.
//   - Pulsante su Calendar standalone workspace (se esiste come pagina
//     separata): non identificata come pagina mancante nel feedback.
//
//   Verifica build:
//     1. Vai su /<slug>/people: a destra dell'header c'e' "+ Add work item"
//        primary. Click -> modal apre.
//     2. Vai su /<slug>/profile/<myUserId>: stesso pulsante a destra del
//        filter. Click -> modal apre.
//     3. Vai su /<slug>/workspace-views/<viewId>: pulsante "+ Add work
//        item" prima di "Add view". Click -> modal apre.
//     4. Nel modal scegli "Workspace" dal picker progetto -> task creato
//        col project_id del workspace project.
//     5. Il task creato compare nella view corrente (se i filtri lo
//        ammettono).
//
// v1.22c: UI modal Create work item con voce "Workspace" (Opzione A).
//   - apps/web/core/components/dropdowns/project/dropdown.tsx
//     Concatena workspaceHiddenProjectId (dal store v1.22b) in cima a
//     joinedProjectIds prima di passarli a ProjectDropdownBase. Il
//     workspace project compare quindi come prima voce nel picker, con
//     name "Workspace" e identifier "WS" (gia' visivamente distintivi).
//   - apps/web/core/components/issues/issue-modal/components/project-select.tsx
//     1. Chiama useWorkspaceProject() in mount per lazy-fetch del backend
//        (idempotente get_or_create + sync ProjectMember).
//     2. renderCondition esteso: il workspace project e' sempre accettato,
//        anche se non e' in allowedProjectIds (caller non puo' conoscere
//        l'ID a priori).
//
//   Cosa NON fa v1.22c:
//   - URL alias /<slug>/work-items/<id> -> v1.22d.
//   - Visualizzazione marker "Workspace task" nelle viste -> v1.22d.
//   - Distinzione visiva nel dropdown (icona globo + separatore) -> nice
//     to have, posticipato.
//
//   Verifica build:
//     1. Apri qualsiasi pagina con il pulsante "+ Create work item" (es.
//        /oniro/your-work, /oniro/workspace-views, sidebar, ecc).
//     2. Click "+" -> modal apre.
//     3. Click sul project picker -> "Workspace" appare in cima.
//     4. Seleziona "Workspace" -> il task viene creato col project_id
//        del progetto fittizio.
//     5. Il task creato e' visibile nelle workspace views, your-work, ecc
//        come tutti gli altri (perche' e' un Issue normale a livello DB).
//
// v1.22b: frontend store + service + hook per workspace project (Opzione A).
//   - packages/types/src/project/projects.ts: IPartialProject.is_hidden
//     opzionale (riflette il backend Project.is_hidden v1.22a).
//   - apps/web/core/store/project/project.store.ts:
//     * Filtri 4 getter (workspaceProjectIds, joinedProjectIds,
//       archivedProjectIds, favoriteProjectIds, e quello che alimenta
//       il sidebar via shouldFilterProject) per escludere progetti
//       is_hidden.
//     * Nuovo getter workspaceHiddenProjectId che ritorna l'ID del
//       progetto fittizio per il workspace corrente (se gia' nel
//       projectMap; altrimenti undefined - chiamare hook dedicato).
//   - apps/web/core/services/workspace-project.service.ts (nuovo):
//     WorkspaceProjectService.getWorkspaceProject(slug) consume
//     l'endpoint backend v1.22a (lazy get_or_create idempotente).
//   - apps/web/core/hooks/use-workspace-project.ts (nuovo):
//     useWorkspaceProject() hook SWR-based, dedup automatico delle
//     chiamate concorrenti. Ritorna {workspaceProject, isLoading,
//     error}.
//
//   Cosa NON fa v1.22b:
//   - UI modal Create work item con voce "Workspace" -> v1.22c.
//   - Visualizzazione marker "Workspace task" nelle viste -> v1.22c.
//   - Route /<slug>/work-items/<id> -> v1.22d.
//
//   Verifica build:
//     1. App carica normalmente, niente errori TS.
//     2. Sidebar Projects: il progetto "Workspace" non appare piu' (era
//        gia' creato in v1.22a verify).
//     3. Console DevTools: useWorkspaceProject() ritorna l'oggetto
//        atteso. Da console:
//        await fetch('/api/workspaces/oniro/workspace-project/').then(r=>r.json())
//        Aspettativa: {id, name: "Workspace", identifier: "WS", is_hidden: true}.
//
// v1.22a: backend foundation per task workspace-level (Opzione A).
//   - Project.is_hidden BooleanField (default False) + migration 0123.
//     Quando is_hidden=True, il progetto e' "fittizio" e serve solo da
//     contenitore per task workspace-level. Il frontend lo nasconde da
//     sidebar/picker.
//   - Endpoint GET /api/workspaces/<slug>/workspace-project/
//     - Cerca un Project con workspace=ws e is_hidden=True; se non
//       esiste, lo crea con name="Workspace", identifier="WS"
//       (con suffisso numerico se collide), network=Secret, tutte
//       le features disabilitate (cycle/module/intake/page/views OFF).
//     - Crea i 6 default state per il progetto fittizio (skip se il
//       workspace ha gia' shared states v1.20a).
//     - Sincronizza ProjectMember col WorkspaceMember (additivo,
//       idempotente).
//   - Permission: WorkspaceEntityPermission.
//   - Atomicita': transaction.atomic per evitare race condition.
//
//   Cosa NON fa v1.22a:
//   - Frontend integration: nessun consumer ancora. La voce "Workspace"
//     nel picker arriva con v1.22b/c. La gestione is_hidden nel store
//     project arriva con v1.22b.
//   - URL alias /<slug>/work-items/<id>: arriva con v1.22 milestone
//     finale (alias che redirect a /projects/<workspaceProjectId>/issues/<id>).
//
//   Verifica build:
//     1. Migration 0123 applicata.
//     2. GET /api/workspaces/oniro/workspace-project/ ritorna
//        {id, name: "Workspace", identifier: "WS", is_hidden: true}.
//     3. Al primo GET, il progetto viene creato. Al secondo, riusato
//        (idempotente).
//     4. Tutti gli workspace member sono ProjectMember del progetto.
//     5. Il progetto NON appare nel sidebar Projects (frontend filter
//        arrivera' in v1.22b; per ora puoi temporaneamente vederlo).
//
// v1.21: Drag-and-drop su "state_detail.group" group_by.
//   - constants/issue/common.ts: aggiunto "state_detail.group" a
//     DRAG_ALLOWED_GROUPS. Sblocca isDragAllowed in list-group.tsx
//     riga 249 e quindi isDraggingAllowed in block.tsx riga 112,
//     che era il check che mostrava il toast "Drag and drop is
//     disabled for the current grouping".
//   - issue-layouts/utils.tsx: handleGroupDragDrop ora intercetta il
//     caso groupBy === "state_detail.group". Il drop su un group
//     destination "started" / "backlog" / ... viene risolto
//     dinamicamente in state_id: cerca uno state del project del task
//     con state.group === destination.groupId e setta
//     updatedIssue.state_id = targetState.id. Se nessuno match
//     (improbabile), il drop si limita a sortOrder.
//   - hooks/use-group-dragndrop.ts: passa il nuovo callback
//     getStatesByProject (estratto da useProjectState.stateMap) come
//     9o argomento di handleGroupDragDrop.
//   - Vincolo: serve che lo stateMap abbia gli state del project del
//     task (project state caricati). Workspace views fetchano gia'
//     workspaceStates a init che include tutti gli state per-project.
//
//   Cosa NON fa v1.21:
//   - Drag-and-drop in Spreadsheet view: lo stock spreadsheet non ha
//     drop fra group (le righe non sono raggruppate). Servirebbe un
//     design dedicato. Skip per ora.
//   - Drag-and-drop su altri group_by problematici (es. "created_by",
//     "target_date") - non in scope.
//
//   Verifica: aprire workspace views / your-work in List layout con
//   group_by "State group" attivo. Trascinare un task da Backlog a
//   Started. Niente toast. Drop -> patchIssue chiamata,
//   stato del task cambia.
//
// v1.20 hotfix #2b: workspace_id fallback nel validate.
//   Bug: dopo hotfix #2, ancora 400 sul PATCH issue. Causa:
//   IssueViewSet.partial_update passa solo `project_id` nel context del
//   serializer, non `workspace_id`. La condizione
//     Q(project__isnull=True, workspace_id=self.context.get("workspace_id"))
//   diventava workspace_id=None che non matcha nessuno state shared
//   (workspace_id su State e' NOT NULL).
//   Fix: in tutti i 4 punti di validate, deriviamo workspace_id da
//     1) self.instance.workspace_id (in update / partial_update)
//     2) self.context.get("workspace_id") (se presente)
//     3) Project.objects.filter(pk=project_id).values_list("workspace_id")
//   Garantisce che workspace shared dello stesso workspace dell'issue
//   passino la validation.
//
// v1.20 hotfix #2: backend serializer Issue/Draft accetta workspace shared.
//   Bug: dopo v1.20d UI, selezionare uno workspace shared state nello
//   StateDropdown di un work item ritornava 400 Bad Request:
//     {"non_field_errors": ["State is not valid please pass a valid state_id"]}
//   Causa: 4 punti di validation in api/serializers/issue.py e
//   app/serializers/{issue,draft}.py controllano che state.project_id
//   coincida col project del task. I workspace shared (project=NULL)
//   non passano la condizione.
//   Fix: rilassata la condizione a
//     Q(project_id=...) | Q(project__isnull=True, workspace_id=...)
//   In tutti i 4 punti. Aggiunto import django.db.models.Q nei 3 file.
//   Lo workspace shared resta vincolato al medesimo workspace dell'issue
//   (impossibile cross-workspace).
//
// v1.20d: Workspace-level shared states - UI completa.
//   STEP 4 (FINAL) della milestone v1.20.
//   - Workspace Settings -> States: nuova pagina /<slug>/settings/states/
//     con CRUD UI (create/update/delete/mark-default) basata su WorkspaceStateRoot
//     che riusa i componenti GroupList + ProjectStateLoader del modulo
//     project-states stock. Permission: Admin/Member possono vedere, solo
//     Admin puo' editare (gate dentro WorkspaceStateRoot.isEditable).
//   - Sidebar workspace settings: aggiunta voce "States" con icona Layers
//     nel gruppo ADMINISTRATION. Implementato via:
//       packages/types/src/settings.ts        -> TWorkspaceSettingsTabs += "states"
//       packages/constants/src/settings/workspace.ts -> WORKSPACE_SETTINGS["states"]
//       sidebar/item-icon.tsx                  -> mappa "states" -> Layers
//   - apps/web/app/.../(workspace)/states/{page,header}.tsx (file nuovi).
//   - apps/web/core/components/workspace-states/{root,index}.tsx (nuovi).
//   - StateDropdown patch: merge automatico project + workspace shared
//     state ids. Quando l'utente apre il dropdown su un task, vede sia gli
//     stati del progetto sia i workspace shared. La fetch lato store e'
//     idempotente: project states fetched solo se mancanti per quel
//     project, workspace states solo se mai fetched per quello slug.
//   - routes-core.ts: nuova route registrata
//       /:workspaceSlug/settings/states  ->  ./states/page.tsx
//
//   Cosa NON fa v1.20d:
//   - Drag and drop di stati (UI usa il GroupList stock; il drag fra group
//     potrebbe richiedere azioni dedicate non ancora implementate per scope
//     workspace - lo affrontiamo se serve).
//   - Indicatori visivi nello StateDropdown per distinguere project vs
//     workspace state (nessun chip; sono mescolati come pari).
//   - Migration interattiva da project state a workspace state. L'utente
//     crea i workspace state manualmente; gli issue esistenti continuano
//     a puntare ai loro project state finche' non li si sposta a mano.
//
//   Verifica build:
//     1. Frontend compila (TypeScript strict): tipo TWorkspaceSettingsTabs
//        ora include "states", e tutti i Record<TWorkspaceSettingsTabs, ...>
//        chiedono la chiave "states".
//     2. Sidebar workspace settings: cliccando in /<slug>/settings/ si vede
//        nuova voce "States" con icona a strati nel gruppo administration.
//     3. /<slug>/settings/states/ apre la pagina, mostra (vuoto) o gli
//        shared state creati via API in v1.20b.
//     4. Crea uno workspace state, modifica nome/colore, mark-default,
//        cancella -> tutto via UI senza errori.
//     5. Apri un task: il dropdown stato mostra in elenco sia gli stati del
//        progetto sia i workspace shared. Selezionare uno workspace shared
//        come stato di un issue funziona.
//
// v1.20c: Workspace-level shared states - frontend store + service.
//   STEP 3 di 4 della milestone v1.20.
//   - project-state.service.ts (full replacement): aggiunti 4 metodi
//     createWorkspaceState / patchWorkspaceState / deleteWorkspaceState /
//     markWorkspaceStateAsDefault che consumano gli endpoint v1.20b.
//   - state.store.ts (full replacement): aggiunti
//     * computed: workspaceSharedStateIds, workspaceSharedStates,
//       groupedWorkspaceSharedStates
//     * getter: getWorkspaceSharedStateById, getWorkspaceSharedDefaultStateId
//     * actions: createWorkspaceState, updateWorkspaceState,
//       deleteWorkspaceState, markWorkspaceStateAsDefault (tutti con
//       optimistic update + rollback su errore)
//     * guardia: gli action workspace rifiutano di essere usati su un
//       project-local state (project_id != null), e viceversa.
//   - Tutti gli state (project + shared) restano nello stesso `stateMap`;
//     la distinzione e' solo runtime via state.project_id.
//
//   Cosa NON fa v1.20c:
//   - UI Workspace Settings (creazione/modifica shared states) -> v1.20d.
//   - Toggle Project Settings "use workspace states" -> v1.20d.
//   - Integrazione StateDropdown per fare merge dei workspace states nelle
//     opzioni del dropdown -> v1.20d.
//
//   Visibile lato UI: niente. Lo store ha le API ma nessun consumer ancora
//   le usa. Build deve girare normale come v1.20b.
//
//   Verifica build:
//     1. Frontend compila senza type errors (TypeScript strict).
//     2. App carica normalmente, nessuna regressione su project state CRUD
//        esistente (creare/modificare state in Project Settings continua a
//        funzionare).
//     3. Da DevTools console: rootStore.state.workspaceSharedStateIds
//        dovrebbe restituire array (vuoto o con gli shared state creati
//        in v1.20b verify).
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
const CUSTOM_PATCH_TAG = "PATCHED v1.30";

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
