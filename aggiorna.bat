@echo off
echo ==========================================
echo   Aggiorna Plane dopo nuove modifiche
echo ==========================================
echo.
echo Usa questo script per riapplicare le patch e
echo ribuildare l'immagine se hai fatto ulteriori modifiche.
echo.
pause

cd /d "%~dp0"

echo [1/3] Applicando patch aggiornate...
copy /Y "patches\profile-issues-filter.tsx" "source\plane\apps\web\core\components\profile\profile-issues-filter.tsx"
copy /Y "patches\profile-issues.tsx"        "source\plane\apps\web\core\components\profile\profile-issues.tsx"
copy /Y "patches\views-helper.tsx"          "source\plane\apps\web\core\components\views\helper.tsx"
copy /Y "patches\ce-views-helper.tsx"       "source\plane\apps\web\ce\components\views\helper.tsx"
copy /Y "patches\filter.ts"                 "source\plane\packages\constants\src\issue\filter.ts"
copy /Y "patches\calendar-profile-root.tsx"   "source\plane\apps\web\core\components\issues\issue-layouts\calendar\roots\profile-issues-root.tsx"
copy /Y "patches\calendar-workspace-root.tsx" "source\plane\apps\web\core\components\issues\issue-layouts\calendar\roots\workspace-root.tsx"
copy /Y "patches\gantt-profile-root.tsx"   "source\plane\apps\web\core\components\issues\issue-layouts\gantt\roots\profile-issues-root.tsx"
copy /Y "patches\gantt-workspace-root.tsx" "source\plane\apps\web\core\components\issues\issue-layouts\gantt\roots\workspace-root.tsx"
echo     OK

echo [2/3] Rebuild immagine Docker...
cd source\plane
docker build -f apps/web/Dockerfile.web -t plane-web-custom:latest .
if errorlevel 1 ( echo ERRORE nel build. & cd ..\.. & pause & exit /b 1 )
cd ..\..
echo     OK

echo [3/3] Riavvio container web...
cd ..\plane-app
docker compose --env-file plane.env restart web
cd ..\plane-custom

echo.
echo   Fatto! Apri http://localhost
pause
