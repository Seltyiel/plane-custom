@echo off
setlocal enableextensions

cd /d "%USERPROFILE%\plane-app"

echo === Apply pending migration 0123 ===
docker compose exec -T api python manage.py migrate db
echo.
echo === Showmigrations DOPO migrate ===
docker compose exec -T api python manage.py showmigrations db --plan | findstr "0122 0123"
echo.
echo === Restart api / worker / beat-worker ===
docker compose restart api worker beat-worker
echo.
echo Aspetta 30 secondi che ripartano, poi apri http://localhost
echo.
pause
