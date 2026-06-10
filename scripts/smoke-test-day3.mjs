// Smoke test del Día 3 contra producción.
// Firma un JWT del usuario fixture y ejerce las rutas nuevas.
import crypto from 'node:crypto'

const API = 'https://api.celura.clinic'
const JWT_SECRET = '/zZZYXajCpQn94eHVp3kD7dAB9FyXtlEedssP5U42i1NLVp/qOex/0Gj4zyFzaFYkQmRhsIZ7DmhJMvPJqUYGA=='
const USER_ID = 'a93b1bb7-7028-4b80-9804-28e1eae9a0f7'

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encHeader = b64url(JSON.stringify(header))
  const encPayload = b64url(JSON.stringify(payload))
  const data = `${encHeader}.${encPayload}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64url(sig)}`
}

const now = Math.floor(Date.now() / 1000)
const token = signJWT(
  {
    sub: USER_ID,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
    email: 'test-dev@celura.clinic',
  },
  JWT_SECRET
)

const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  console.log(`${method} ${path} → ${res.status}`)
  console.log(JSON.stringify(parsed, null, 2))
  console.log('---')
  return { status: res.status, body: parsed }
}

console.log('Token (primeros 60):', token.slice(0, 60), '...')
console.log('===')

// 1. /api/clinics/me — debe traer el fixture
await call('GET', '/api/clinics/me')

// 2. /onboarding/clinic — debe dar 409 porque ya existe
await call('POST', '/onboarding/clinic', {
  name: 'Clínica Duplicada',
  slug: 'duplicada-' + Date.now(),
})

// 3. PATCH config — cambiar assistant_name
await call('PATCH', '/api/clinics/me/config', {
  assistant_name: 'Sofía',
  tone: 'warm',
})

// 4. GET /api/leads — vacío esperado
const list1 = await call('GET', '/api/leads')

// 5. POST /api/leads — crear uno
const phone = '+52155512345' + Math.floor(Math.random() * 100).toString().padStart(2, '0')
const created = await call('POST', '/api/leads', {
  name: 'Smoke Test Lead',
  phone,
  treatment_interest: 'blanqueamiento',
  urgency_level: 'low',
  notes: 'Creado por smoke-test-day3',
})

const newId = created.body?.lead?.id

// 6. GET /api/leads/:id
if (newId) await call('GET', `/api/leads/${newId}`)

// 7. PATCH /api/leads/:id — avanzar etapa
if (newId) await call('PATCH', `/api/leads/${newId}`, {
  stage: 'contacted',
  notes: 'Contactado por smoke test',
})

// 8. GET /api/leads con filtro
await call('GET', '/api/leads?stage=contacted&order=score')

// 9. Verificar el masked de claude key (no debe llegar la real)
await call('GET', '/api/clinics/me')
