# Celura — Backend & API

Sistema de inteligencia conversacional para clínicas dentales.
Multi-tenant con aislamiento total por clínica.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js 22 + Fastify + TypeScript |
| Base de datos | Supabase (PostgreSQL + RLS) |
| IA | Claude Sonnet 4 (API key por clínica) |
| WhatsApp | Baileys (sesiones aisladas por tenant) |
| Cola | BullMQ + Redis (Upstash) |
| Deploy API | Render (Starter + Persistent Disk) |
| Deploy Dashboard | cPanel (build estático) |

## Aislamiento por tenant

Cada clínica tiene:
- Su propia fila en `clinics` con RLS por `owner_id`
- Su carpeta de sesión WA en `/sessions/{clinic_id}/`
- Sus API keys encriptadas con AES-256-GCM
- Un cliente Supabase con su JWT (no puede ver datos de otras clínicas)

## Setup local

### 1. Prerrequisitos
```bash
node -v  # >= 22
pnpm -v  # >= 9
```

### 2. Clonar e instalar
```bash
git clone https://github.com/tu-usuario/celura
cd celura
pnpm install
```

### 3. Configurar variables de entorno
```bash
cd apps/api
cp .env.example .env
# Editar .env con tus credenciales de Supabase, Redis, etc.
```

### 4. Crear el schema en Supabase
```bash
# Ir a Supabase Dashboard → SQL Editor
# Copiar y ejecutar: packages/db/schema.sql
```

### 5. Correr en desarrollo
```bash
# En la raíz del monorepo:
pnpm dev:api        # API en puerto 3000
pnpm dev:dashboard  # Dashboard en puerto 5173
```

## Generar ENCRYPTION_KEY
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Variables de entorno necesarias

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | Anon key (pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (privada, solo backend) |
| `JWT_SECRET` | JWT secret de Supabase |
| `ENCRYPTION_KEY` | 64 chars hex para encriptar API keys |
| `REDIS_URL` | URL de Redis (Upstash recomendado) |
| `WA_SESSIONS_PATH` | Ruta donde guardar sesiones WA |
| `ALLOWED_ORIGINS` | Origins permitidos en CORS |

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check (público) |
| GET | `/api/whatsapp/status` | Estado de conexión WA |
| GET | `/api/whatsapp/qr` | Genera QR para conectar |
| GET | `/api/whatsapp/qr/stream` | SSE: actualizaciones en tiempo real |
| POST | `/api/whatsapp/disconnect` | Desconectar WhatsApp |

## Deploy

- **API**: Ver `render.yaml` en la raíz
- **Dashboard**: Ver `DEPLOY_CPANEL.md`

## Seguridad

- RLS en todas las tablas — aislamiento a nivel de base de datos
- API keys encriptadas con AES-256-GCM antes de guardarse
- Rate limiting: 100 req/min por IP
- JWT verificado en cada request protegido
- Sesiones WA aisladas en carpetas separadas por `clinic_id`
