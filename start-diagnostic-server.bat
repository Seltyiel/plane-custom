@echo off
setlocal enableextensions

REM ===========================================================
REM   plane-custom - Diagnostic log server (v1.13)
REM ===========================================================
REM
REM Avvia il server Node che riceve i log file-based dal browser.
REM
REM Endpoint:
REM   POST http://localhost:9999/log    -> appende JSON al log
REM   POST http://localhost:9999/clear  -> azzera il log
REM   GET  http://localhost:9999/health -> "OK"
REM
REM Output: scrive su diagnostic.log accanto al .js (stessa cartella).
REM Reset: il log viene azzerato a ogni boot del server.
REM
REM USO:
REM   - Doppio click qui per avviare. La finestra resta aperta.
REM   - Ctrl+C per fermare il server.
REM   - Chiudi la finestra per terminare bruscamente.
REM
REM Quando ti serve: durante diagnostica frontend (es. v1.13).
REM Le patch del web (diagnostic-logger.ts, base-kanban-root, ecc)
REM fanno fetch keepalive a http://localhost:9999/log con il dato.
REM Se il server non gira la fetch fallisce silenziosa - i log
REM finiscono solo nella console del browser.
REM ===========================================================

cd /d "%~dp0"
title plane-custom diagnostic server (port 9999)

REM -------------------------------------------------------
REM Check Node installato
REM -------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo ERRORE: Node.js non trovato nel PATH.
    echo Installa Node da https://nodejs.org/ ^(versione LTS basta^).
    pause
    exit /b 1
)

REM -------------------------------------------------------
REM Check porta 9999 gia' occupata
REM -------------------------------------------------------
netstat -ano | findstr ":9999 " | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo ATTENZIONE: la porta 9999 e' gia' in uso.
    echo Probabilmente il server e' gia' attivo in un'altra finestra.
    echo PID che la usa:
    netstat -ano ^| findstr ":9999 " ^| findstr "LISTENING"
    echo.
    echo Se vuoi terminarlo: taskkill /F /PID ^<numero^>
    echo Oppure chiudi prima quella finestra e rilancia questo .bat.
    pause
    exit /b 1
)

REM -------------------------------------------------------
REM Check file presente
REM -------------------------------------------------------
if not exist "diagnostic-server.js" (
    echo ERRORE: diagnostic-server.js non trovato in %CD%.
    pause
    exit /b 1
)

REM -------------------------------------------------------
REM Avvia
REM -------------------------------------------------------
echo.
echo ============================================================
echo   plane-custom diagnostic server
echo ============================================================
echo   Listening:  http://localhost:9999
echo   Log file:   %CD%\diagnostic.log
echo   Stop:       Ctrl+C in questa finestra
echo ============================================================
echo.

node diagnostic-server.js

REM Se arriviamo qui, il server e' uscito (Ctrl+C o crash).
echo.
echo Server fermato. Premi un tasto per chiudere.
pause >nul
exit /b 0
