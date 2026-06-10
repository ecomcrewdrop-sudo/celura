# ============================================================
#  CELURA · Deploy del Dashboard en cPanel
#  El dashboard es React + Vite → build estático
#  cPanel lo sirve como archivos HTML/CSS/JS normales
# ============================================================

## PASO 1: Build local
```bash
cd apps/dashboard
npm install
npm run build
# Genera: apps/dashboard/dist/
```

## PASO 2: Subir a cPanel

### Opción A: File Manager de cPanel (más fácil)
1. Comprimir la carpeta `dist/` en un .zip
2. Abrir cPanel → File Manager
3. Navegar a `public_html/app/` (o el subdirectorio que quieras)
4. Subir el .zip → Extract
5. Verificar que `index.html` esté en `public_html/app/`

### Opción B: FTP/SFTP (más rápido para actualizaciones)
```bash
# Instalar lftp o usar FileZilla
lftp -e "mirror -R apps/dashboard/dist/ /public_html/app/" sftp://user:pass@tuhost.com
```

### Opción C: Automatizar con GitHub Actions
```yaml
# .github/workflows/deploy-dashboard.yml
name: Deploy Dashboard

on:
  push:
    branches: [main]
    paths: ['apps/dashboard/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - run: cd apps/dashboard && npm install && npm run build

      - name: Deploy to cPanel via FTP
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: ${{ secrets.FTP_HOST }}
          username: ${{ secrets.FTP_USER }}
          password: ${{ secrets.FTP_PASS }}
          local-dir: apps/dashboard/dist/
          server-dir: /public_html/app/
```

## PASO 3: Configurar .htaccess para React Router

El dashboard usa React Router. cPanel necesita este .htaccess
para que las rutas funcionen (no dar 404 en refresh):

Crear archivo `public_html/app/.htaccess`:
```apache
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]
```

## PASO 4: Variables de entorno del frontend

Crear `apps/dashboard/.env.production`:
```
VITE_API_URL=https://celura-api.onrender.com
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

IMPORTANTE: Las variables VITE_ se embeben en el build.
NUNCA poner SUPABASE_SERVICE_ROLE_KEY aquí.

## PASO 5: Subdominio recomendado

En cPanel → Subdomains:
- Subdominio: `app`
- Dominio: `celura.clinic`
- Document Root: `public_html/app`

El dashboard queda en: https://app.celura.clinic

## ESTRUCTURA FINAL

```
cPanel public_html/
├── app/                    ← Dashboard React (app.celura.clinic)
│   ├── index.html
│   ├── assets/
│   │   ├── index-[hash].js
│   │   └── index-[hash].css
│   └── .htaccess
└── (resto del sitio)
```

## DEPLOY PIPELINE COMPLETO

```
git push → GitHub Actions build → FTP a cPanel
git push → Render auto-deploy (API)
```

Las variables de entorno sensibles van en:
- Render: Dashboard → Environment
- cPanel: Solo las variables VITE_ (públicas por diseño de Vite)
- Supabase: Dashboard → Settings → API
