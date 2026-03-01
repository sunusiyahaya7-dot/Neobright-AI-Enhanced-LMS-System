# NeoBright Docker Setup Guide

## 🐳 Architecture

```
infra/
├── docker-compose.yaml          # All services orchestrated
├── .env                         # Configuration (create from .env.example)
├── .env.example                 # Template
└── moodle/
    ├── Dockerfile               # Moodle image (jhardison/moodle)
    └── php.ini                  # PHP configuration

Services:
- db (MariaDB 10.6)              - Database
- moodle (Moodle LMS)            - Learning Management System
- ai_backend (Flask)             - AI Insights Engine
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Docker Desktop installed and running
- All credentials ready (OpenAI API key, Moodle token, Firebase service account)

### 2. Setup

```bash
cd neobright/infra

# Copy example env file
cp .env.example .env

# Edit .env with the right credentials
# - OPENAI_API_KEY: Your OpenAI API key
# - MOODLE_TOKEN: Your Moodle API token
# - DB_PASSWORD, DB_ROOT_PASSWORD: Database credentials
```

### 3. Start All Services

```bash
# Start all containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 4. Access Services

- **Moodle**: http://localhost:8080
- **AI Backend**: http://localhost:5000
- **API Health Check**: http://localhost:5000/health

---

## 📝 Service Details

### MariaDB (db)
```
Image: mariadb:10.6
Container: neobright_moodle_db
Port: 3306 (internal only)
Volume: moodle_db_data:/var/lib/mysql
Status: Health check every 10s
```

### Moodle (moodle)
```
Image: jhardison/moodle:latest
Container: neobright_moodle_app
Port: 8080 → 80
Depends on: db (healthy)
Volumes:
  - moodledata:/var/moodledata
  - ./php.ini:/etc/php/7.4/apache2/conf.d/99-moodle.ini
```

### AI Backend (ai_backend)
```
Build: ../../backend/Dockerfile
Container: neobright_ai_backend
Port: 5000 → 5000
Depends on: moodle
Volumes:
  - ../../backend:/app (live code)
  - firebase-service-account.json (read-only)
Health check: /health endpoint
```

---

## 🔧 Configuration (.env)

### Database
```env
DB_NAME=moodle
DB_USER=moodle
DB_PASSWORD=password_here
DB_ROOT_PASSWORD=root_password_here
```

### Moodle
```env
MOODLE_PORT=8080
MOODLE_TOKEN=moodle_api_token_here
MOODLE_BASE_URL=http://localhost:8080
```

### AI Backend
```env
BACKEND_PORT=5000
FLASK_ENV=development

# OpenAI
OPENAI_API_KEY=api_key_here
AI_MODEL=gpt-4o-mini
AI_TEMPERATURE=0.6
AI_MAX_TOKENS=500

# Backend URL for file proxies
BACKEND_URL=http://localhost:5000

# Firebase (path inside container)
FIREBASE_SERVICE_ACCOUNT_PATH=/app/firebase-service-account.json
```

---

## 📋 Common Commands

```bash
# Build and start
docker-compose up -d

# View all logs
docker-compose logs

# View specific service logs
docker-compose logs ai_backend
docker-compose logs moodle
docker-compose logs db

# Restart service
docker-compose restart ai_backend

# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data!)
docker-compose down -v

# Rebuild image (if Dockerfile changed)
docker-compose up -d --build

# SSH into container
docker-compose exec ai_backend bash
docker-compose exec moodle bash

# Run command in container
docker-compose exec ai_backend python -c "print('test')"

# Check service status
docker-compose ps
```

---

## 🔍 Troubleshooting

### Backend won't start
```bash
# Check logs
docker-compose logs ai_backend

# Verify dependencies
docker-compose ps

# Rebuild
docker-compose up -d --build ai_backend
```

### Can't connect to Moodle from Backend
- Backend uses `http://moodle:80` (Docker DNS)
- Frontend uses `http://localhost:8080` (browser)
- Make sure services are on same network: `neobright`

### Firebase service account not found
```bash
# Make sure file exists in backend folder
ls -la backend/firebase-service-account.json

# Volume mount should handle it
# Path in container: /app/firebase-service-account.json
```

### Port conflicts
```bash
# Change ports in .env
BACKEND_PORT=5001    # Use different port if 5000 busy
MOODLE_PORT=8081     # Use different port if 8080 busy

# Restart
docker-compose down
docker-compose up -d
```

### Database permissions
```bash
# Reset database
docker-compose down -v
docker-compose up -d db
docker-compose up -d moodle  # Wait for moodle to initialize
```

---

## 📊 Network Architecture

```
┌─────────────────────────────────────────┐
│       Docker Network: neobright         │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐                       │
│  │   db         │ (MariaDB)             │
│  │ :3306        │                       │
│  └──────┬───────┘                       │
│         │                               │
│         ├──────────────┐                │
│         │              │                │
│  ┌──────▼────────┐  ┌──▼──────────┐   │
│  │   moodle      │  │ ai_backend  │   │
│  │ :80 (→8080)   │  │ :5000       │   │
│  └───────────────┘  └─────────────┘   │
│                                         │
└─────────────────────────────────────────┘
     ↓                      ↓
  Host Port 8080      Host Port 5000
```

---

## 🔒 Security Notes

### Development
- All services use `restart: unless-stopped`
- Volumes include live code (for development)
- Health checks monitor service status
- Credentials in `.env` (don't commit!)

### Production
- Change FLASK_ENV to `production`
- Use strong passwords for DB
- Mount secrets as read-only volumes
- Use environment-specific .env files
- Add resource limits (CPU, memory)
- Use external database if scaling

---

## 📈 Scaling

### Running locally with Docker
```bash
docker-compose up -d    # All services
```

### Scaling to production
1. Move database to managed service (AWS RDS, Google Cloud SQL)
2. Add Kubernetes orchestration
3. Use CI/CD pipeline for deployments
4. Add load balancing for multiple backend instances
5. Use external cache (Redis) for rate limiting

---

## ✅ Health Checks

```bash
# AI Backend
curl http://localhost:5000/health

# Moodle
curl http://localhost:8080

# Database
docker-compose exec db mysqladmin -h localhost -u root -p${DB_ROOT_PASSWORD} ping
```

---

## 📝 Next Steps

1. ✅ Create `.env` from `.env.example`
2. ✅ Add Firebase service account file to `backend/`
3. ✅ Run `docker-compose up -d` from `infra/`
4. ✅ Verify all services running: `docker-compose ps`
5. ✅ Test endpoints work
6. ✅ Deploy frontend

---

**Ready to containerize NeoBright!** 🚀
