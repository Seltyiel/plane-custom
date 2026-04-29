@echo off
setlocal enableextensions
echo ==========================================
echo   Build Plane Custom - Full 5 Layouts
echo   (List, Board, Calendar, Table, Gantt)
echo ==========================================
echo.

REM -------------------------------------------------------
REM Path critici
REM   PROJECT_DIR = questa cartella (in OneDrive) - contiene patches/ e Dockerfile
REM   BUILD_ROOT  = area di build FUORI da OneDrive (evita Files On-Demand)
REM -------------------------------------------------------
set PROJECT_DIR=%~dp0
set PATCHES_DIR=%~dp0patches
set DOCKERFILE=%~dp0Dockerfile.custom-web
set BUILD_ROOT=%USERPROFILE%\plane-build
set SRC_ROOT=%BUILD_ROOT%\source
set PLANE_SRC=%SRC_ROOT%\plane

echo Project dir (OneDrive): %PROJECT_DIR%
echo Build area (locale):    %BUILD_ROOT%
echo.

REM Log file in OneDrive (comodo da consultare)
set LOG=%PROJECT_DIR%build.log
echo Build started %DATE% %TIME% > "%LOG%"

echo Press any key to start, or close this window to abort.
pause

REM -------------------------------------------------------
REM 1. Pulisci e clona sorgente Plane (FUORI da OneDrive)
REM -------------------------------------------------------
echo [1/6] Pulizia e clone sorgente Plane in %BUILD_ROOT%... >> "%LOG%"
echo [1/6] Pulizia e clone sorgente Plane in %BUILD_ROOT%...

if not exist "%BUILD_ROOT%" (
    mkdir "%BUILD_ROOT%"
    if errorlevel 1 (
        echo ERRORE: Impossibile creare %BUILD_ROOT%.
        pause
        exit /b 1
    )
)

if exist "%SRC_ROOT%" (
    echo     Rimozione %SRC_ROOT% precedente...
    rmdir /s /q "%SRC_ROOT%"
)

mkdir "%SRC_ROOT%"
if errorlevel 1 (
    echo ERRORE: Impossibile creare %SRC_ROOT%.
    pause
    exit /b 1
)

pushd "%SRC_ROOT%"
git clone --depth=1 https://github.com/makeplane/plane.git 1>> "%LOG%" 2>&1
if errorlevel 1 (
    echo ERRORE: git clone fallito. Verifica git + connessione.
    echo Controlla il log: %LOG%
    popd
    pause
    exit /b 1
)
popd
echo     OK - Sorgente clonato in %PLANE_SRC%.

if not exist "%PLANE_SRC%\apps\web\core\components\profile\profile-issues.tsx" (
    echo ERRORE: Struttura sorgente non trovata dopo il clone.
    pause
    exit /b 1
)

REM Hardening del .dockerignore: esclude cartelle di editor/IDE che potrebbero
REM comparire se qualcuno apre la sorgente con Claude Code/Cursor/VSCode.
echo. >> "%PLANE_SRC%\.dockerignore"
echo # Aggiunto da build.bat - esclude configurazioni editor >> "%PLANE_SRC%\.dockerignore"
echo .claude >> "%PLANE_SRC%\.dockerignore"
echo **/.claude >> "%PLANE_SRC%\.dockerignore"
echo .cursor >> "%PLANE_SRC%\.dockerignore"
echo **/.cursor >> "%PLANE_SRC%\.dockerignore"

REM -------------------------------------------------------
REM 2. Copia file patch (full replacements) da OneDrive -> BUILD
REM -------------------------------------------------------
echo [2/6] Applicando patch di sostituzione file...
echo [2/6] Applicando patch di sostituzione file... >> "%LOG%"

copy /Y "%PATCHES_DIR%\02-filters\profile-issues.tsx" "%PLANE_SRC%\apps\web\core\components\profile\profile-issues.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\02-filters\profile-issues-filter.tsx" "%PLANE_SRC%\apps\web\core\components\profile\profile-issues-filter.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\shared\ce-views-helper.tsx" "%PLANE_SRC%\apps\web\ce\components\views\helper.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\workspace-roots\list-workspace-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\list\roots\workspace-root.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\workspace-roots\kanban-workspace-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\kanban\roots\workspace-root.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\profile-roots\spreadsheet-profile-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\spreadsheet\roots\profile-issues-root.tsx" >nul
if errorlevel 1 goto :patcherr

REM Crea cartelle roots mancanti per calendar e gantt
if not exist "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\calendar\roots" (
    mkdir "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\calendar\roots"
)
if not exist "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\gantt\roots" (
    mkdir "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\gantt\roots"
)

copy /Y "%PATCHES_DIR%\01-layouts\profile-roots\calendar-profile-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\calendar\roots\profile-issues-root.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\profile-roots\gantt-profile-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\gantt\roots\profile-issues-root.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\workspace-roots\calendar-workspace-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\calendar\roots\workspace-root.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\workspace-roots\gantt-workspace-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\gantt\roots\workspace-root.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.16: rimuove fetchIssues redundante di AllIssueLayoutRoot che sovrascriveva
REM la fetch grouped del Calendar (workspace views) -> calendario vuoto.
copy /Y "%PATCHES_DIR%\01-layouts\shared\all-issue-layout-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\roots\all-issue-layout-root.tsx" >nul
if errorlevel 1 goto :patcherr

REM ErrorBoundary diagnostico per catturare il vero errore dei 4 layout workspace
copy /Y "%PATCHES_DIR%\99-diagnostics\workspace-layout-error-boundary.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\workspace-layout-error-boundary.tsx" >nul
if errorlevel 1 goto :patcherr

REM Global error logger su window + onRecoverableError (smaschera errori React minificati)
copy /Y "%PATCHES_DIR%\99-diagnostics\entry-client.tsx" "%PLANE_SRC%\apps\web\app\entry.client.tsx" >nul
if errorlevel 1 goto :patcherr

REM Fix workspace.service.ts: 11 metodi throwavano error?.response senza .data -> "undefined"
copy /Y "%PATCHES_DIR%\02-filters\workspace-service.ts" "%PLANE_SRC%\apps\web\core\services\workspace.service.ts" >nul
if errorlevel 1 goto :patcherr

REM Marker visibile "PATCHED v1" accanto a Community (verifica a occhio della build custom)
copy /Y "%PATCHES_DIR%\00-core\edition-badge.tsx" "%PLANE_SRC%\apps\web\ce\components\workspace\edition-badge.tsx" >nul
if errorlevel 1 goto :patcherr

echo     OK - File di patch base applicati.

REM -------------------------------------------------------
REM 3. Copia file con type union estesi
REM -------------------------------------------------------
echo [3/6] Applicando patch con type unions estesi (GLOBAL/PROFILE)...
echo [3/6] Applicando patch union... >> "%LOG%"

copy /Y "%PATCHES_DIR%\01-layouts\base-roots\base-list-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\list\base-list-root.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\base-roots\base-kanban-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\kanban\base-kanban-root.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.06: HOC con traces per capire se mostra loader/empty/children
copy /Y "%PATCHES_DIR%\01-layouts\shared\issue-layout-HOC.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\issue-layout-HOC.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\base-roots\base-spreadsheet-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\spreadsheet\base-spreadsheet-root.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\shared\use-group-dragndrop.ts" "%PLANE_SRC%\apps\web\core\hooks\use-group-dragndrop.ts" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\base-roots\base-calendar-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\calendar\base-calendar-root.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\01-layouts\base-roots\base-gantt-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\gantt\base-gantt-root.tsx" >nul
if errorlevel 1 goto :patcherr

copy /Y "%PATCHES_DIR%\02-filters\constants-issue-filter.ts" "%PLANE_SRC%\packages\constants\src\issue\filter.ts" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.21: aggiungere "state_detail.group" a DRAG_ALLOWED_GROUPS in
REM packages/constants/src/issue/common.ts cosi' il drop su group_by=state_detail.group
REM (workspace views / your-work / profile) non e' piu' bloccato dal toast
REM "Drag and drop is disabled for the current grouping".
copy /Y "%PATCHES_DIR%\01-layouts\shared\constants-issue-common.ts" "%PLANE_SRC%\packages\constants\src\issue\common.ts" >nul
if errorlevel 1 goto :patcherr

REM Patch workspace issue filter store: fix race condition + abort handling + layout hardcoding
copy /Y "%PATCHES_DIR%\02-filters\workspace-filter-store.ts" "%PLANE_SRC%\apps\web\core\store\issue\workspace\filter.store.ts" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.07: issue-layouts/utils.tsx (getStateColumns+getCreatedByColumns workspace-aware)
copy /Y "%PATCHES_DIR%\01-layouts\shared\layouts-utils.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\utils.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.08: global-view.store.ts (swallowAbort su fetchIssuesWithExistingPagination fire-and-forget)
copy /Y "%PATCHES_DIR%\02-filters\global-view-store.ts" "%PLANE_SRC%\apps\web\core\store\global-view.store.ts" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.13: diagnostic file-based logger (dlog -> http://localhost:9999/log)
REM Copia il modulo in apps/web/core/lib/ cosi' @/lib/diagnostic-logger risolve.
if not exist "%PLANE_SRC%\apps\web\core\lib" (
    mkdir "%PLANE_SRC%\apps\web\core\lib"
)
copy /Y "%PATCHES_DIR%\99-diagnostics\diagnostic-logger.ts" "%PLANE_SRC%\apps\web\core\lib\diagnostic-logger.ts" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.13: kanban default.tsx con tracing (early return null vs render)
copy /Y "%PATCHES_DIR%\01-layouts\shared\kanban-default.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\kanban\default.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.15: backend WorkspaceViewIssuesViewSet per applicare group_by server-side.
REM Senza questo, il backend /my-issues ignorava group_by e ritornava array piatto
REM -> Kanban/Gantt workspace con bucket "All Issues" unico -> colonne vuote -> bianca.
copy /Y "%PATCHES_DIR%\03-backend\view-base.py" "%PLANE_SRC%\apps\api\plane\app\views\view\base.py" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.18: Team dashboard backend - nuovo endpoint aggregato
REM   GET /api/workspaces/<slug>/members/stats/
REM Nuovo file (additivo):
copy /Y "%PATCHES_DIR%\03-backend\api-team-stats-view.py" "%PLANE_SRC%\apps\api\plane\app\views\workspace\team_stats.py" >nul
if errorlevel 1 goto :patcherr
REM PATCH v1.19b: Team dashboard backend - per-member issue list (lazy tree).
REM   GET /api/workspaces/<slug>/members/<uuid:user_id>/issues/
REM Nuovo file (additivo):
copy /Y "%PATCHES_DIR%\03-backend\api-team-issues-view.py" "%PLANE_SRC%\apps\api\plane\app\views\workspace\team_issues.py" >nul
if errorlevel 1 goto :patcherr
REM Registrazione route in urls/workspace.py (full replacement, include sia v1.18 che v1.19b):
copy /Y "%PATCHES_DIR%\03-backend\api-urls-workspace.py" "%PLANE_SRC%\apps\api\plane\app\urls\workspace.py" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.20a: Workspace-level shared states (Opzione 3).
REM   - state.py model: project FK NULLABLE + 2 unique conditional indexes
REM     (project-local vs workspace-shared scope).
REM   - migration 0122: AlterField project nullable, RemoveConstraint legacy,
REM     AlterUniqueTogether vuoto, AddConstraint x 2.
REM   - project/base.py: skip i 6 default states quando esistono workspace
REM     shared states (back-compat per workspace senza shared states).
copy /Y "%PATCHES_DIR%\03-backend\state-model.py" "%PLANE_SRC%\apps\api\plane\db\models\state.py" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\03-backend\migration-0122-workspace-states.py" "%PLANE_SRC%\apps\api\plane\db\migrations\0122_v120a_workspace_level_states.py" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\03-backend\project-base-view.py" "%PLANE_SRC%\apps\api\plane\app\views\project\base.py" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.20 hotfix #2: serializer Issue/Draft accetta workspace shared states.
REM   Senza questa, il backend rifiuta con 400 "State is not valid please pass
REM   a valid state_id" quando il frontend tenta di assegnare uno workspace
REM   shared a un issue.
copy /Y "%PATCHES_DIR%\03-backend\api-serializers-issue.py" "%PLANE_SRC%\apps\api\plane\api\serializers\issue.py" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\03-backend\app-serializers-issue.py" "%PLANE_SRC%\apps\api\plane\app\serializers\issue.py" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\03-backend\app-serializers-draft.py" "%PLANE_SRC%\apps\api\plane\app\serializers\draft.py" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.22a: progetto "Workspace" fittizio (Opzione A workspace-level tasks).
REM   - Project.is_hidden field + migration 0123.
REM   - Endpoint /api/workspaces/<slug>/workspace-project/ con lazy
REM     get_or_create + sync ProjectMember.
copy /Y "%PATCHES_DIR%\03-backend\project-model.py" "%PLANE_SRC%\apps\api\plane\db\models\project.py" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\03-backend\migration-0123-project-is-hidden.py" "%PLANE_SRC%\apps\api\plane\db\migrations\0123_v122a_project_is_hidden.py" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\03-backend\api-workspace-project-endpoint.py" "%PLANE_SRC%\apps\api\plane\app\views\workspace\workspace_project.py" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.24a: backend endpoint per move issue tra progetti.
REM   POST /api/workspaces/<slug>/issues/<issue_id>/move/
REM   Body: {target_project_id, include_sub_issues}
copy /Y "%PATCHES_DIR%\08-move-issue\api-issue-move-view.py" "%PLANE_SRC%\apps\api\plane\app\views\workspace\issue_move.py" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.24b: frontend service + hook per move issue.
REM   - services/issue-move.service.ts: IssueMoveService.moveIssue
REM   - hooks/use-move-issue.tsx: useMoveIssue() orchestra API + cache cleanup
REM     + toast con action item "View" che naviga al task nel nuovo project.
copy /Y "%PATCHES_DIR%\08-move-issue\issue-move-service.ts" "%PLANE_SRC%\apps\web\core\services\issue-move.service.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\08-move-issue\use-move-issue.tsx" "%PLANE_SRC%\apps\web\core\hooks\use-move-issue.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.24c: UI move issue.
REM   - move-issue-modal.tsx (nuovo file): modal con project picker + toggle
REM     sub-issue + preview campi resettati.
REM   - quick-action-helper.tsx: createMoveMenuItem factory + integrato nei
REM     hook menu (project, all, cycle, module, detail).
REM   - all-issue.tsx, project-issue.tsx, issue-detail.tsx (full replacement):
REM     state moveIssueModalOpen + render del modal + pass setter ai props.
copy /Y "%PATCHES_DIR%\08-move-issue\move-issue-modal.tsx" "%PLANE_SRC%\apps\web\core\components\issues\move-issue-modal.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\08-move-issue\quick-action-helper.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\quick-action-dropdowns\helper.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\08-move-issue\all-issue-quick-actions.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\quick-action-dropdowns\all-issue.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\08-move-issue\project-issue-quick-actions.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\quick-action-dropdowns\project-issue.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\08-move-issue\issue-detail-quick-actions.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\quick-action-dropdowns\issue-detail.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.26a: dashboard backend endpoint /me/dashboard/.
copy /Y "%PATCHES_DIR%\09-dashboard\api-dashboard-view.py" "%PLANE_SRC%\apps\api\plane\app\views\workspace\dashboard.py" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.26b: dashboard service + hook SWR.
copy /Y "%PATCHES_DIR%\09-dashboard\dashboard-service.ts" "%PLANE_SRC%\apps\web\core\services\dashboard.service.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\09-dashboard\use-my-dashboard.ts" "%PLANE_SRC%\apps\web\core\hooks\use-my-dashboard.ts" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.26c: MyDashboard component + injection nella home page.
copy /Y "%PATCHES_DIR%\09-dashboard\my-dashboard.tsx" "%PLANE_SRC%\apps\web\core\components\home\my-dashboard.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\09-dashboard\workspace-home-page.tsx" "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(projects)\page.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.22b: frontend store + service + hook per workspace project fittizio.
REM   - types/project: IPartialProject.is_hidden
REM   - project store: filter is_hidden + getter workspaceHiddenProjectId
REM   - service WorkspaceProjectService.getWorkspaceProject
REM   - hook useWorkspaceProject (SWR-based)
copy /Y "%PATCHES_DIR%\06-workspace-tasks\types-project-projects.ts" "%PLANE_SRC%\packages\types\src\project\projects.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\06-workspace-tasks\project-store.ts" "%PLANE_SRC%\apps\web\core\store\project\project.store.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\06-workspace-tasks\workspace-project-service.ts" "%PLANE_SRC%\apps\web\core\services\workspace-project.service.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\06-workspace-tasks\use-workspace-project.ts" "%PLANE_SRC%\apps\web\core\hooks\use-workspace-project.ts" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.22c: UI modal Create work item con voce Workspace in picker.
REM   - dropdowns/project/dropdown.tsx: concat workspaceHiddenProjectId in cima.
REM   - issues/issue-modal/components/project-select.tsx: lazy fetch hook +
REM     renderCondition esteso per accettare workspace project.
copy /Y "%PATCHES_DIR%\06-workspace-tasks\project-dropdown.tsx" "%PLANE_SRC%\apps\web\core\components\dropdowns\project\dropdown.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\06-workspace-tasks\issue-modal-project-select.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-modal\components\project-select.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.22d: pulsante "+ Add work item" su pagine workspace-level.
REM   - profile/[userId]/header.tsx: pulsante in Header.RightItem (Your Work).
REM   - workspace-views/header.tsx: pulsante prima di "Add view".
REM   - people/header.tsx: e' gia' applicata in patches/04-people-page (full
REM     replacement) -> il copy della versione v1.22d-aware avviene piu' giu'
REM     nel blocco People page. Niente da fare qui.
copy /Y "%PATCHES_DIR%\06-workspace-tasks\profile-userid-header.tsx" "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(projects)\profile\[userId]\header.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\06-workspace-tasks\workspace-views-header.tsx" "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(projects)\workspace-views\header.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.22e: marker visivo "Workspace task" sull'IssueIdentifier shared.
REM   Aggiunge un'icona Globe + tooltip dopo l'identifier text quando
REM   projectId === workspaceHiddenProjectId. Una sola patch copre tutti i 5
REM   layout (list/kanban/calendar/gantt/spreadsheet) + peek-overview + ecc.
copy /Y "%PATCHES_DIR%\06-workspace-tasks\issue-identifier.tsx" "%PLANE_SRC%\apps\web\ce\components\issues\issue-details\issue-identifier.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.23: quick-add inline ovunque (workspace views + Your Work).
REM   - quick-add/root.tsx: fallback al workspaceHiddenProjectId quando URL
REM     non porta projectId. Lazy fetch SWR del workspace project.
REM   - workspace/issue.store.ts: quickAddIssue = this.issueQuickAdd
REM     (era undefined per disabilitare il quick-add a livello workspace).
REM   - profile/issue.store.ts: enableQuickAdd:true su assigned/created
REM     (subscribed resta off) + quickAddIssue = this.issueQuickAdd.
REM   - hooks/use-issues-actions.tsx: espone quickAddIssue in
REM     useGlobalIssueActions e useProfileIssueActions, con auto-assign su
REM     profile/assigned (assignees=userId server-side filter).
copy /Y "%PATCHES_DIR%\07-quick-add\quick-add-root.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\quick-add\root.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\07-quick-add\workspace-issue-store.ts" "%PLANE_SRC%\apps\web\core\store\issue\workspace\issue.store.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\07-quick-add\profile-issue-store.ts" "%PLANE_SRC%\apps\web\core\store\issue\profile\issue.store.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\07-quick-add\use-issues-actions.tsx" "%PLANE_SRC%\apps\web\core\hooks\use-issues-actions.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.23b: sblocca il menu hover "+" sulle celle del Calendar in
REM workspace context. Stock riga 82 ha if(!projectId) return null che
REM blocca il pulsante quick-add inline su ogni day-tile.
copy /Y "%PATCHES_DIR%\07-quick-add\calendar-quick-add-issue-actions.tsx" "%PLANE_SRC%\apps\web\core\components\issues\issue-layouts\calendar\quick-add-issue-actions.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.20b: workspace shared states CRUD endpoints.
REM   - workspace/state.py: GET (esteso) + POST + WorkspaceStateDetailEndpoint
REM     (GET/PATCH/DELETE) + WorkspaceStateMarkDefaultEndpoint (POST).
REM   - urls/workspace.py: 2 nuove path() registrate.
copy /Y "%PATCHES_DIR%\03-backend\state-workspace-view.py" "%PLANE_SRC%\apps\api\plane\app\views\workspace\state.py" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.20c: frontend store + service per workspace shared states.
REM   - project-state.service.ts: 4 nuovi metodi REST CRUD.
REM   - state.store.ts: 4 nuove action + 4 nuovi computed + getter.
REM   Nessun consumer ancora le usa (UI in v1.20d): build = invariato a UI.
copy /Y "%PATCHES_DIR%\05-states\project-state-service.ts" "%PLANE_SRC%\apps\web\core\services\project\project-state.service.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\05-states\state-store.ts" "%PLANE_SRC%\apps\web\core\store\state.store.ts" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.20d: UI Workspace Settings -> States + sidebar entry + StateDropdown merge.
REM   - types-settings.ts: TWorkspaceSettingsTabs esteso con "states".
REM   - constants-settings-workspace.ts: WORKSPACE_SETTINGS["states"] + sidebar group ADMINISTRATION.
REM   - sidebar-item-icon.tsx: icona Layers per "states".
REM   - workspace-state-root.tsx (file nuovo): orchestrator analogo di ProjectStateRoot.
REM   - workspace-states-page.tsx + header.tsx (file nuovi): la pagina settings.
REM   - state-dropdown.tsx: merge automatico project + workspace shared state ids.
REM   - routes-core.ts: registrata la nuova rotta /<slug>/settings/states/.
copy /Y "%PATCHES_DIR%\05-states\types-settings.ts" "%PLANE_SRC%\packages\types\src\settings.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\05-states\constants-settings-workspace.ts" "%PLANE_SRC%\packages\constants\src\settings\workspace.ts" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\05-states\sidebar-item-icon.tsx" "%PLANE_SRC%\apps\web\core\components\settings\workspace\sidebar\item-icon.tsx" >nul
if errorlevel 1 goto :patcherr
REM Crea la directory components/workspace-states (file nuovi additivi)
if not exist "%PLANE_SRC%\apps\web\core\components\workspace-states" (
    mkdir "%PLANE_SRC%\apps\web\core\components\workspace-states"
)
copy /Y "%PATCHES_DIR%\05-states\workspace-state-root.tsx" "%PLANE_SRC%\apps\web\core\components\workspace-states\root.tsx" >nul
if errorlevel 1 goto :patcherr
REM Crea l'index.ts per esportare WorkspaceStateRoot:
> "%PLANE_SRC%\apps\web\core\components\workspace-states\index.ts" echo export * from "./root";
REM Crea la directory della page settings (additiva).
mkdir "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(settings)\settings\(workspace)\states" 2>nul
copy /Y "%PATCHES_DIR%\05-states\workspace-states-page.tsx" "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(settings)\settings\(workspace)\states\page.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\05-states\workspace-states-header.tsx" "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(settings)\settings\(workspace)\states\header.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\05-states\state-dropdown.tsx" "%PLANE_SRC%\apps\web\core\components\dropdowns\state\dropdown.tsx" >nul
if errorlevel 1 goto :patcherr

REM PATCH v1.19: Team dashboard frontend - People page.
REM Servizio client per l'endpoint v1.18 (file nuovo, additivo):
copy /Y "%PATCHES_DIR%\04-people-page\people-stats-service.ts" "%PLANE_SRC%\apps\web\core\services\people-stats.service.ts" >nul
if errorlevel 1 goto :patcherr
REM Crea cartella per la People page (nuova rotta workspace-level).
REM NB: uso mkdir ... 2>nul invece di if-not-exist+mkdir in blocco, perche'
REM     il path contiene parentesi (il gruppo route "(projects)") che possono
REM     confondere il parser cmd.exe dentro un blocco "if (...) ( ... )".
mkdir "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(projects)\people" 2>nul
copy /Y "%PATCHES_DIR%\04-people-page\people-page.tsx" "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(projects)\people\page.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\04-people-page\people-layout.tsx" "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(projects)\people\layout.tsx" >nul
if errorlevel 1 goto :patcherr
copy /Y "%PATCHES_DIR%\04-people-page\people-header.tsx" "%PLANE_SRC%\apps\web\app\(all)\[workspaceSlug]\(projects)\people\header.tsx" >nul
if errorlevel 1 goto :patcherr
REM Registrazione route in routes/core.ts (full replacement):
copy /Y "%PATCHES_DIR%\04-people-page\routes-core.ts" "%PLANE_SRC%\apps\web\app\routes\core.ts" >nul
if errorlevel 1 goto :patcherr
REM Voce sidebar in packages/constants/src/workspace.ts (full replacement):
copy /Y "%PATCHES_DIR%\04-people-page\constants-workspace.ts" "%PLANE_SRC%\packages\constants\src\workspace.ts" >nul
if errorlevel 1 goto :patcherr
REM Icona Users nello switch del sidebar helper (full replacement):
copy /Y "%PATCHES_DIR%\04-people-page\sidebar-helper.tsx" "%PLANE_SRC%\apps\web\ce\components\workspace\sidebar\helper.tsx" >nul
if errorlevel 1 goto :patcherr
REM "people" aggiunto a staticItems in SidebarItemBase (altrimenti il gate
REM isPinned+staticItems filtra via la voce, che resterebbe invisibile
REM finche' nessun utente non la pinna manualmente):
copy /Y "%PATCHES_DIR%\04-people-page\sidebar-item-base.tsx" "%PLANE_SRC%\apps\web\core\components\workspace\sidebar\sidebar-item.tsx" >nul
if errorlevel 1 goto :patcherr

echo     OK - Type unions estesi.

REM -------------------------------------------------------
REM 4. Build immagine Docker (web + api)
REM -------------------------------------------------------
echo [4/6] Building immagine Docker web (20-40 minuti)...
echo [4/6] Docker build web... >> "%LOG%"

if not exist "%DOCKERFILE%" (
    echo ERRORE: %DOCKERFILE% non trovato.
    pause
    exit /b 1
)

pushd "%PLANE_SRC%"
docker build -f "%DOCKERFILE%" -t plane-web-custom:latest .
if errorlevel 1 (
    echo.
    echo ERRORE: Docker build web fallito. Log: %LOG%
    popd
    pause
    exit /b 1
)
popd
echo     OK - Immagine web costruita.

REM PATCH v1.15: build immagine API custom con backend patchato
echo [4/6] Building immagine Docker api (5-15 minuti)...
echo [4/6] Docker build api... >> "%LOG%"

pushd "%PLANE_SRC%\apps\api"
docker build -f Dockerfile.api -t plane-api-custom:latest .
if errorlevel 1 (
    echo.
    echo ERRORE: Docker build api fallito. Log: %LOG%
    popd
    pause
    exit /b 1
)
popd
echo     OK - Immagine api costruita.

REM -------------------------------------------------------
REM 5. Crea docker-compose.override.yml
REM -------------------------------------------------------
echo [5/6] Configurando override...

if not exist "%PROJECT_DIR%..\plane-app" (
    echo ATTENZIONE: Cartella ..\plane-app non trovata. Salto override/restart.
    (
    echo services:
    echo   web:
    echo     image: plane-web-custom:latest
    echo   api:
    echo     image: plane-api-custom:latest
    echo   worker:
    echo     image: plane-api-custom:latest
    echo   beat-worker:
    echo     image: plane-api-custom:latest
    echo   migrator:
    echo     image: plane-api-custom:latest
    ) > "%PROJECT_DIR%docker-compose.override.yml"
    echo Generato docker-compose.override.yml in %PROJECT_DIR%.
    goto :done
)

(
echo services:
echo   web:
echo     image: plane-web-custom:latest
echo   api:
echo     image: plane-api-custom:latest
echo   worker:
echo     image: plane-api-custom:latest
echo   beat-worker:
echo     image: plane-api-custom:latest
echo   migrator:
echo     image: plane-api-custom:latest
) > "%PROJECT_DIR%..\plane-app\docker-compose.override.yml"

echo     OK - override creato (web + api + worker + beat-worker + migrator).

REM -------------------------------------------------------
REM 6. Riavvia i container web e api
REM -------------------------------------------------------
echo [6/6] Riavviando Plane (web + api + worker)...

pushd "%PROJECT_DIR%..\plane-app"
REM PATCH v1.22a: aggiunto "migrator" al restart per applicare migration nuove
REM dopo build delle immagini API. Senza, il migrator restava in stato
REM Exited(0) della run precedente e le migration non venivano applicate.
REM 'restart: on-failure' nel compose impedisce auto-rerun ma permette il
REM manual restart che facciamo qui.
if exist "plane.env" (
    docker compose --env-file plane.env up -d --no-deps migrator
    docker compose --env-file plane.env up -d --no-deps web api worker beat-worker
) else (
    docker compose up -d --no-deps migrator
    docker compose up -d --no-deps web api worker beat-worker
)
popd

:done
echo.
echo ==========================================
echo   COMPLETATO!
echo   Apri http://localhost
echo ==========================================
pause
exit /b 0

:patcherr
echo.
echo ERRORE durante l'applicazione delle patch.
echo Controlla il log: %LOG%
pause
exit /b 1
