@echo off
setlocal enableextensions enabledelayedexpansion

REM ===========================================================
REM   plane-custom - Quick commit + push
REM ===========================================================
REM
REM Workflow:
REM   - Lanciato quando una milestone e' stabile e verificata.
REM   - Mostra cosa e' cambiato nel repo.
REM   - Chiede il messaggio di commit.
REM   - Fa: git add . + git commit + git push
REM
REM Le credenziali GitHub sono salvate da Git Credential Manager
REM dopo il primo push, quindi qui non viene chiesta nulla.
REM ===========================================================

cd /d "%~dp0"

REM Pulisci eventuali lock residui (capita dopo che il sandbox
REM Linux di Cowork ha tenuto handle aperti).
if exist ".git\index.lock" (
    echo Rimuovo .git\index.lock residuo...
    del /f /q ".git\index.lock"
)

echo.
echo ============================================================
echo   plane-custom - Quick commit + push
echo ============================================================
echo.
echo Cartella: %CD%
echo.
echo === Cosa e' cambiato ===
git status -sb
echo.

REM Se non c'e' niente da committare, esci subito.
git diff --quiet --cached
set CACHED_EMPTY=!errorlevel!
git diff --quiet
set WT_EMPTY=!errorlevel!

if "!CACHED_EMPTY!"=="0" if "!WT_EMPTY!"=="0" (
    echo Niente da committare. Repo gia' allineato.
    pause
    exit /b 0
)

REM -------------------------------------------------------
REM Chiedi messaggio
REM -------------------------------------------------------
echo Esempi di messaggio:
echo   v1.20: workspace-level states ^(Opzione B^)
echo   v1.21: drag and drop su state group column
echo   fix: edge case in spreadsheet column resize
echo.
set /p COMMIT_MSG=Messaggio di commit:

if "!COMMIT_MSG!"=="" (
    echo ERRORE: messaggio vuoto. Annullato.
    pause
    exit /b 1
)

REM -------------------------------------------------------
REM Add + Commit + Push
REM -------------------------------------------------------
echo.
echo [1/3] git add .
git add .
if errorlevel 1 goto :err

echo [2/3] git commit -m "!COMMIT_MSG!"
git commit -m "!COMMIT_MSG!"
if errorlevel 1 goto :err

echo [3/3] git push
git push
if errorlevel 1 goto :err

echo.
echo ============================================================
echo   FATTO!  Commit pushato su origin/main.
echo ============================================================
git log --oneline -3
echo.
echo URL repo: https://github.com/Seltyiel/plane-custom
echo.
pause
exit /b 0

:err
echo.
echo ERRORE durante l'operazione. Vedi messaggi sopra.
pause
exit /b 1
