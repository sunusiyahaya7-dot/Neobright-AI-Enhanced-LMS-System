@echo off
REM Moodle Database Backup Script for Windows
REM Usage: backup.bat

setlocal enabledelayedexpansion

set BACKUP_DIR=backups
set TIMESTAMP=%date:~10,4%%date:~4,2%%date:~7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set BACKUP_FILE=%BACKUP_DIR%\moodle_backup_%TIMESTAMP%.sql

REM Create backup directory if it doesn't exist
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo Starting Moodle database backup...
echo Backup file: %BACKUP_FILE%

REM Read .env file and set variables
for /f "tokens=1,2 delims==" %%a in (.env) do (
    if "%%a"=="DB_ROOT_PASSWORD" set DB_ROOT_PASSWORD=%%b
)

REM Backup the database
docker exec neobright_moodle_db mysqldump ^
    -u root ^
    -p%DB_ROOT_PASSWORD% ^
    --single-transaction ^
    --lock-tables=false ^
    moodle > "%BACKUP_FILE%"

if errorlevel 1 (
    echo ERROR: Backup failed
    exit /b 1
)

echo.
echo ✓ Backup completed successfully!
echo Location: %BACKUP_FILE%
echo.
echo To restore this backup, run:
echo docker exec -i neobright_moodle_db mysql -u root -p%DB_ROOT_PASSWORD% moodle ^< %BACKUP_FILE%
pause
