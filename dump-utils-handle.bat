@echo off
setlocal enableextensions

set OUT=%~dp0utils-handle-dump.txt
cd /d "%USERPROFILE%\plane-app"

echo === Container web image timestamp === > "%OUT%"
docker compose images web >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Cerco riferimenti a state__group nei bundle compilati === >> "%OUT%"
docker compose exec -T web sh -c "find / -name '*.js' -path '*/build/*' 2>/dev/null | head -3" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Cerco file di build per ispezione === >> "%OUT%"
docker compose exec -T web sh -c "ls -la /app/apps/web/build/client/assets/ 2>/dev/null | head -20" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Grep state__group nei bundle JS ^(prima 5 occurrenze^) === >> "%OUT%"
docker compose exec -T web sh -c "grep -l 'state__group' /app/apps/web/build/client/assets/*.js 2>/dev/null | head -5" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo === Cerco un pattern unico della mia patch v1.21 ^(state_id + state__group insieme^) === >> "%OUT%"
docker compose exec -T web sh -c "grep -l 'state__group.*destination' /app/apps/web/build/client/assets/*.js 2>/dev/null | head -3" >> "%OUT%" 2>&1
docker compose exec -T web sh -c "grep -l 'getStatesByProject' /app/apps/web/build/client/assets/*.js 2>/dev/null | head -3" >> "%OUT%" 2>&1

echo Done. Scrivi "utils dumpato".
pause
