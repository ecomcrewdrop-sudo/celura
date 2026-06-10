# ============================================================
#  CELURA · Deploy en Railway
# ============================================================

## Por qué Railway sobre Render

- Volumen persistente incluido en Hobby ($5/mes) — sin config extra
- Sin cold starts — el servidor siempre está corriendo
- Deploy en ~2 minutos vs ~5 en Render
- Dashboard más limpio, logs en tiempo real

---

## PASO 1 — Crear proyecto en Railway

1. Ir a railway.app → New Project
2. "Deploy from GitHub repo" → conectar tu repo de Celura
3. Railway detecta el `railway.toml` automáticamente

---

## PASO 2 — Agregar Redis (BullMQ lo necesita)

En el proyecto de Railway:
1. New → Database → Add Redis
2. Railway crea el Redis y lo conecta automáticamente
3. En las variables de entorno del servicio API, agregar:
   ```
   REDIS_URL=${{Redis.REDIS_URL}}
   ```
   Railway resuelve esta referencia solo.

---

## PASO 3 — Agregar Volumen persistente (sesiones WhatsApp)

1. En el servicio API → Settings → Volumes
2. Add Volume:
   - Mount Path: `/data`
   - Size: 1 GB (más que suficiente)
3. Agregar variable de entorno:
   ```
   WA_SESSIONS_PATH=/data/sessions
   ```

Sin este volumen las sesiones de WhatsApp se pierden en cada deploy
y el doctor tendría que escanear el QR de nuevo cada vez.

---

## PASO 4 — Variables de entorno en Railway

En el servicio API → Variables, agregar todas estas:

```bash
NODE_ENV=production
PORT=3000

# Supabase
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT_SECRET=<copiarlo de Supabase → Settings → API → JWT Secret>

# Encriptación de API keys de doctores
# Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<64 chars hex>

# Redis (referencia automática al Redis de Railway)
REDIS_URL=${{Redis.REDIS_URL}}

# WhatsApp sessions (volumen persistente)
WA_SESSIONS_PATH=/data/sessions

# CORS — tu dominio de cPanel
ALLOWED_ORIGINS=https://app.celura.clinic,http://localhost:5173

# Logs
LOG_LEVEL=info
```

---

## PASO 5 — Dominio

Railway genera un dominio automático tipo:
`celura-api-production.up.railway.app`

Para dominio custom:
1. Settings → Networking → Custom Domain
2. Agregar: `api.celura.clinic`
3. En cPanel → Zone Editor → agregar CNAME:
   - Name: `api`
   - Value: `celura-api-production.up.railway.app`

---

## PASO 6 — Primer deploy

```bash
git add .
git commit -m "feat: initial Celura API"
git push origin main
```

Railway detecta el push y deploya automáticamente.
Ver progreso en el dashboard de Railway en tiempo real.

---

## Variables del Dashboard React (cPanel)

En `apps/dashboard/.env.production`:
```
VITE_API_URL=https://api.celura.clinic
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

NUNCA poner `SUPABASE_SERVICE_ROLE_KEY` en el frontend.

---

## Estructura final de servicios

```
Railway Project: celura
├── Service: celura-api          → api.celura.clinic
│   ├── Volume: /data/sessions   → sesiones WhatsApp
│   └── Connected to Redis
└── Service: Redis               → interno (no expuesto)

cPanel: app.celura.clinic        → dashboard React estático
Supabase: xxxxxxxx.supabase.co   → base de datos
Upstash (alternativa a Railway Redis): si prefieres serverless
```

---

## Monitoreo

Railway incluye métricas básicas (CPU, RAM, requests).
Para logs en tiempo real desde terminal:
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Ver logs
railway logs --tail
```

---

## Costo estimado con 10 clientes

| Servicio | Costo |
|----------|-------|
| Railway Hobby | $5/mes |
| Supabase Free | $0/mes |
| Redis (Railway incluido) | $0 adicional |
| cPanel (ya tienes) | $0 adicional |
| **Total infraestructura** | **$5/mes** |

El único costo variable es el uso de Railway por encima de los $5
de créditos incluidos. Con 10 clientes activos, probablemente
llegues a $10-15/mes máximo.
