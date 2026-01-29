#!/bin/bash
# Moodle Database Backup Script
# Usage: ./backup.sh or bash backup.sh

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/moodle_backup_$TIMESTAMP.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting Moodle database backup..."
echo "Backup file: $BACKUP_FILE"

# Read environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Backup the database
docker exec neobright_moodle_db mysqldump \
    -u root \
    -p"$DB_ROOT_PASSWORD" \
    --single-transaction \
    --lock-tables=false \
    moodle > "$BACKUP_FILE"

echo "Backup completed successfully!"
echo "Location: $BACKUP_FILE"
echo ""
echo "To restore this backup, run:"
echo "docker exec -i neobright_moodle_db mysql -u root -p$DB_ROOT_PASSWORD moodle < $BACKUP_FILE"
