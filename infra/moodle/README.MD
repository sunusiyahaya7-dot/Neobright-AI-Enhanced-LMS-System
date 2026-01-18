# NeoBright Moodle Setup

This directory contains the Docker Compose configuration for running **Moodle 4.0.4+** (Learning Management System) with MariaDB locally for development.

## Quick Start

### Prerequisites
- Docker & Docker Compose installed
- `.env` file configured with database and admin credentials

### Setup

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your values:**
   ```
   MOODLE_PORT=8080
   DB_NAME=moodle
   DB_USER=moodle
   DB_PASSWORD=your_secure_password
   DB_ROOT_PASSWORD=your_secure_root_password
   ```

3. **Start the containers:**
   ```bash
   docker compose up -d
   ```

4. **Access Moodle:**
   - Open http://localhost:8080 in your browser
   - Login with your configured admin credentials

## Environment Variables

Create a `.env` file in this directory with the following variables:

| Variable | Description | Example |
|---|---|---|
| `MOODLE_PORT` | Port to access Moodle | `8080` |
| `DB_NAME` | Database name | `moodle` |
| `DB_USER` | Database user | `moodle` |
| `DB_PASSWORD` | Database password | `secure_pass` |
| `DB_ROOT_PASSWORD` | MariaDB root password | `secure_root_pass` |
| `MOODLE_ADMIN_USER` | Admin username (set during install) | `admin` |
| `MOODLE_ADMIN_PASSWORD` | Admin password (set during install) | `admin_password` |
| `MOODLE_ADMIN_EMAIL` | Admin email | `admin@example.com` |
| `MOODLE_SITE_NAME` | Site display name | `NeoBright Moodle` |
| `MOODLE_SITE_SHORTNAME` | Site short name | `NeoBright` |

**Note:** `.env` is ignored by Git and should never be committed. Use `.env.example` as a template.

## Services

### Moodle Application
- **Image:** `jhardison/moodle:latest`
- **Container:** `neobright_moodle_app`
- **Port:** `${MOODLE_PORT}:80`
- **URL:** http://localhost:${MOODLE_PORT}
- **Path:** `/var/www/html` (Moodle install)
- **Data:** `/var/moodledata` (persistent storage)

### MariaDB Database
- **Image:** `mariadb:10.6`
- **Container:** `neobright_moodle_db`
- **Port:** `3306` (internal, not exposed)
- **Healthcheck:** Ensures database is ready before Moodle starts

## Admin Access

### Reset Admin Password

If you lose access to your admin account, reset the password via CLI:

```bash
docker exec -w /var/www/html neobright_moodle_app php admin/cli/reset_password.php --username=admin --password="NewPassword123!" --ignore-password-policy
```

Replace `admin` with your username and set a strong password.

## Web Services & REST API

### Enable Web Services

1. **Enable Web Services:**
   - Site administration → Advanced features → Enable web services ✓

2. **Enable REST Protocol:**
   - Site administration → Server → Web services → Manage protocols → REST ✓

### Create External Service

1. Go to **Site administration → Server → Web services → External services**
2. Click **Add**
3. Enter a name (e.g., `neobright_service`)
4. **Enable** the service
5. Add required functions (e.g., `core_webservice_get_site_info`)
6. Set **Authorised users** to include your admin user
7. Save

### Generate Web Service Token

1. Go to **Site administration → Server → Web services → Manage tokens**
2. Click **Add**
3. Select your service and user
4. Copy the generated token
5. Store securely (treat as a password)

### Test API Call

```bash
curl "http://localhost:8080/webservice/rest/server.php?wstoken=YOUR_TOKEN&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json"
```

**Troubleshooting API:**
- **webservice_access_exception:** Web services not enabled, REST protocol disabled, or token doesn't have permission.
- **invalid_parameter:** Check function name and parameters match Moodle API docs.

## Common Tasks

### View Logs

```bash
docker compose logs -f moodle    # Moodle app logs
docker compose logs -f db        # Database logs
```

### Restart Services

```bash
docker compose restart
```

### Stop Services

```bash
docker compose down
```

### Remove All Data (destructive)

```bash
docker compose down -v
```

### Access Moodle CLI

```bash
docker exec -w /var/www/html -it neobright_moodle_app bash
# Then run PHP CLI commands
php admin/cli/install.php
```

### Connect to Database

```bash
docker exec -it neobright_moodle_db mariadb -uroot -p
# Enter root password when prompted
```

## Troubleshooting

### "Error: Database connection failed"
- Verify `DB_HOST` is set to `db` in docker-compose config
- Check MariaDB is healthy: `docker compose ps`
- Verify `.env` credentials match docker-compose settings

### "XAMPP Apache page showing instead of Moodle"
- Ensure `MOODLE_URL` is set in docker-compose environment
- Clear browser cache and try http://localhost:8080/index.php

### "Access denied for user 'moodle'"
- Verify database credentials in `.env`
- Check MariaDB container logs: `docker compose logs db`

### "Site not reached"
- Ensure containers are running: `docker compose ps`
- Check if port 8080 is in use: `netstat -an | findstr 8080` (Windows)
- Try rebuilding: `docker compose up -d --force-recreate`

## File Structure

```
infra/moodle/
├── docker-compose.yaml    # Docker services definition
├── .env                   # Environment variables (ignored by Git)
├── .env.example           # Template for .env
└── README.MD              # This file
```

## Security Notes

- **Never commit `.env`** — it contains passwords
- Use strong, unique passwords for production
- Restrict database access to internal networks only
- Change default admin credentials immediately
- Store API tokens securely (env vars, secrets manager)
- Enable HTTPS in production (requires reverse proxy/SSL cert)

## Additional Resources

- [Moodle Documentation](https://docs.moodle.org/)
- [Moodle Web Services API](https://docs.moodle.org/en/Web_services)
- [MariaDB Documentation](https://mariadb.com/docs/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)

## Support

For issues with this setup:
1. Check logs: `docker compose logs`
2. Verify `.env` file is properly configured
3. Ensure Docker/Docker Compose are up to date
4. Check firewall settings (port 8080 access)
