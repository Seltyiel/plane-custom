@echo off
setlocal enableextensions

REM ============================================================
REM   plane-custom - Setup git repo (run UNA volta sola)
REM ============================================================
REM
REM Cosa fa:
REM   1. git init su questa cartella
REM   2. Configura user.name / user.email locali
REM   3. Primo commit con tutto il lavoro corrente
REM   4. Stampa istruzioni per aggiungere remote GitHub privato
REM
REM Dopo questo script, lavori normalmente con git da cmd o GUI
REM (GitHub Desktop / VS Code Source Control / SourceTree, ecc.)
REM ============================================================

cd /d "%~dp0"
echo Cartella: %CD%
echo.

REM Check se .git esiste gia'
if exist ".git" (
    echo ATTENZIONE: .git esiste gia' in questa cartella.
    echo Se vuoi rifare l'init da zero, cancella manualmente .git e rilancia.
    echo Altrimenti: usa "git status" per vedere lo stato attuale.
    pause
    exit /b 1
)

REM Check git installato
where git >nul 2>nul
if errorlevel 1 (
    echo ERRORE: git non trovato nel PATH. Installa Git for Windows.
    pause
    exit /b 1
)

echo [1/4] git init...
git init -b main
if errorlevel 1 goto :err

echo.
echo [2/4] Config user...
git config user.email "acampora.ivan@gmail.com"
git config user.name "Ciro"

echo.
echo [3/4] git add + commit iniziale...
git add .
if errorlevel 1 goto :err

git commit -m "v1.19c initial commit: 5 layouts + filter parity + Team dashboard People page interattiva"
if errorlevel 1 goto :err

echo.
echo [4/4] Status finale:
git log --oneline -5
echo.
echo ============================================================
echo   FATTO!
echo ============================================================
echo.
echo PROSSIMI PASSI per backup remoto:
echo.
echo  1. Vai su https://github.com/new e crea un repo PRIVATO
echo     - Nome consigliato: plane-custom
echo     - NON aggiungere README / .gitignore / LICENSE
echo       (li abbiamo gia' in locale)
echo.
echo  2. Quando GitHub ti mostra la pagina "quick setup", copia
echo     l'URL del repo (es. https://github.com/Tuonome/plane-custom.git)
echo     e lancia da questa cartella:
echo.
echo        git remote add origin https://github.com/Tuonome/plane-custom.git
echo        git push -u origin main
echo.
echo  3. Da quel momento ogni "git push" salva su GitHub. Per nuove
echo     versioni:
echo        git add .
echo        git commit -m "v1.20: workspace-level states"
echo        git push
echo.
echo Suggerimento: per evitare di reinserire username/password ogni
echo volta, usa Git Credential Manager (incluso in Git for Windows)
echo o crea una Personal Access Token su GitHub.
echo.
pause
exit /b 0

:err
echo.
echo ERRORE durante il setup git. Vedi messaggi sopra.
pause
exit /b 1
