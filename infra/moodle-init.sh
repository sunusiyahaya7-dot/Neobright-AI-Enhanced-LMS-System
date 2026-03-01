#!/bin/bash
# Initialize Moodle with correct MariaDB configuration

CONFIG_FILE="/var/www/html/config.php"
WAIT_TIME=30

echo "Waiting for database to be ready..."
for i in $(seq 1 $WAIT_TIME); do
    if mysql -h db -u moodle -p"${DB_PASSWORD}" moodle -e "SELECT 1" > /dev/null 2>&1; then
        echo "Database is ready!"
        break
    fi
    echo "Waiting... ($i/$WAIT_TIME)"
    sleep 1
done

# Check if config.php exists
if [ -f "$CONFIG_FILE" ]; then
    echo "Found existing config.php, updating configuration..."
    
    # Update dbtype from mysql/mysqli to mariadb
    sed -i "s/\$CFG->dbtype.*=.*'mysql.*'/\$CFG->dbtype    = 'mariadb';/" "$CONFIG_FILE"
    sed -i "s/\$CFG->dbtype.*=.*'mysqli'/\$CFG->dbtype    = 'mariadb';/" "$CONFIG_FILE"
    echo "✓ Updated dbtype to mariadb"
    
    # Update wwwroot to hardcode localhost:8080 instead of using getenv
    sed -i "s/\$CFG->wwwroot.*/\$CFG->wwwroot   = 'http:\/\/localhost:8080';/" "$CONFIG_FILE"
    echo "✓ Updated wwwroot to http://localhost:8080"
else
    echo "config.php does not exist yet (first install)"
fi

# Start Apache
exec apache2-foreground
