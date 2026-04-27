@echo off
setlocal enableextensions

REM ===========================================================
REM   plane-custom - Cleanup line endings + commit .gitattributes
REM ===========================================================
REM
REM Cosa fa:
REM   1. Verifica che git sia OK e che non ci siano lock attivi
REM   2. Aggiunge il .gitattributes gia' scritto su disco
REM   3. git add --renormalize . (riallinea il working tree a LF)
REM   4. Commit "Reorg: pin LF line endings via .gitattributes"
REM   5. git push verso GitHub
REM
REM Quando lanciare: una volta sola, dopo il move out of OneDrive.
REM Risolve il fatto che `git status` mostrava tutti i file come
REM modificati per via del CRLF→LF mismatch (cosmetico, non
REM funzionale).
REM ===========================================================

cd /d "%~dp0"
echo Cartella: %CD%
echo.

REM -------------------------------------------------------
REM Sanity check
REM -------------------------------------------------------
where git >nul 2>nul
if errorlevel 1 (
    echo ERRORE: git non trovato nel PATH.
    pause
    exit /b 1
)

if not exist ".git" (
    echo ERRORE: %CD% non e' un repo git.
    pause
    exit /b 1
)

if not exist ".gitattributes" (
    echo ATTENZIONE: .gitattributes non trovato. Lo creo qui.
    (
        echo # Default: tratta come testo, normalizza a LF nel repo, LF nel working tree.
        echo # Risolve i "tutti i file modificati" che si vedono dopo un git clone su
        echo # Windows quando autocrlf=true converte a CRLF al checkout.
        echo * text=auto eol=lf
        echo.
        echo # Eccezioni: gli script Windows preferiscono CRLF.
        echo *.bat text eol=crlf
        echo *.cmd text eol=crlf
        echo.
        echo # File binari espliciti
        echo *.png binary
        echo *.jpg binary
        echo *.jpeg binary
        echo *.gif binary
        echo *.ico binary
        echo *.pdf binary
        echo *.zip binary
        echo *.gz binary
    ) > .gitattributes
    echo     Creato .gitattributes.
)

REM -------------------------------------------------------
REM Pulisci lock residui (se ci sono)
REM -------------------------------------------------------
if exist ".git\index.lock" (
    echo Rimuovo .git\index.lock residuo...
    del /f /q ".git\index.lock"
)

REM -------------------------------------------------------
REM Step 1: add .gitattributes
REM -------------------------------------------------------
echo.
echo [1/4] git add .gitattributes...
git add .gitattributes
if errorlevel 1 goto :err

REM -------------------------------------------------------
REM Step 2: renormalize
REM -------------------------------------------------------
echo.
echo [2/4] git add --renormalize . (riallineamento line endings)...
git add --renormalize .
if errorlevel 1 goto :err

REM -------------------------------------------------------
REM Step 3: status
REM -------------------------------------------------------
echo.
echo [3/4] Cosa verra' committato (numero file):
for /f %%c in ('git diff --cached --name-only ^| find /c /v ""') do echo     %%c file modificati
echo.

REM -------------------------------------------------------
REM Step 4: commit + push
REM -------------------------------------------------------
echo.
echo [4/4] Commit + push...
git commit -m "Reorg: pin LF line endings via .gitattributes"
if errorlevel 1 (
    echo Nessun cambiamento da committare ^(potrebbe essere gia' fatto^).
) else (
    git push
    if errorlevel 1 goto :err
)

echo.
echo ============================================================
echo   FATTO!
echo ============================================================
git log --oneline -5
echo.
echo Da ora in poi `git status` sara' pulito ^(niente piu' "M" sui file^).
echo.
pause
exit /b 0

:err
echo.
echo ERRORE durante l'operazione. Vedi messaggi sopra.
pause
exit /b 1
