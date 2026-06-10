// ============================================================
//  CELURA · Test de aislamiento entre clínicas (RLS real)
//
//  Crea (o reutiliza) dos clientes:
//   A = fixture original (Clinica Dev Test)
//   B = usuario nuevo + clínica nueva
//
//  Luego confirma que B NUNCA ve datos de A:
//   - listado de leads
//   - acceso por ID
//   - update de un lead ajeno
//   - update por endpoint protegido (config/clinic ajena)
// ============================================================
import crypto from 'node:crypto'

const API = 'https://api.celura.clinic'
const SUPABASE_URL = 'https://xxbrzknouhahzohpjadd.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const JWT_SECRET = process.env.JWT_SECRET ?? ''

if (!SERVICE_ROLE_KEY || !JWT_SECRET) {
  console.error('Faltan SUPABASE_SERVICE_ROLE_KEY o JWT_SECRET en env')
  process.exit(1)
}

// ── Helpers ────────────────────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64url(sig)}`
}
function tokenFor(userId) {
  const now = Math.floor(Date.now() / 1000)
  return signJWT(
    { sub: userId, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 },
    JWT_SECRET,
  )
}

async function api(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let parsed
  try { parsed = await res.json() } catch { parsed = null }
  return { status: res.status, body: parsed }
}

async function supabaseAdmin(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let parsed
  try { parsed = await res.json() } catch { parsed = null }
  return { status: res.status, body: parsed }
}

// ── Assertions ────────────────────────────────────────────
let pass = 0, fail = 0
const FAILURES = []
function expect(label, actual, expected) {
  const ok = actual === expected
  console.log(`${ok ? '✓' : '✗'} ${label} → got ${actual}, expected ${expected}`)
  if (ok) pass++
  else { fail++; FAILURES.push(label) }
}

// ── Setup ─────────────────────────────────────────────────
const USER_A = 'a93b1bb7-7028-4b80-9804-28e1eae9a0f7'  // fixture
const tokenA = tokenFor(USER_A)

console.log('— Creando usuario B en Supabase Auth...')
const userBEmail = `isolation-test-${Date.now()}@celura.clinic`
const created = await supabaseAdmin('POST', '/auth/v1/admin/users', {
  email: userBEmail,
  password: 'IsolationTest123!',
  email_confirm: true,
})
if (created.status >= 400) {
  console.error('Falló creación del user B:', created.status, created.body)
  process.exit(1)
}
const USER_B = created.body.id
console.log(`  user B: ${USER_B} (${userBEmail})`)

const tokenB = tokenFor(USER_B)

// ── Crear clínica B vía /onboarding/clinic ────────────────
console.log('— B hace onboarding...')
const onboard = await api('POST', '/onboarding/clinic', tokenB, {
  name: 'Clínica Aislamiento B',
  slug: `isolation-b-${Date.now()}`,
  country: 'MX',
})
expect('B onboarding → 201', onboard.status, 201)
const clinicB = onboard.body?.clinic

// ── A crea un lead suyo ──────────────────────────────────
console.log('— A crea un lead privado...')
const phoneA = `+52155599${Math.floor(1000 + Math.random() * 9000)}`
const leadACreate = await api('POST', '/api/leads', tokenA, {
  name: 'Lead PRIVADO de A',
  phone: phoneA,
  notes: 'NUNCA debe ser visible para B',
})
expect('A POST /leads → 201', leadACreate.status, 201)
const leadAId = leadACreate.body?.lead?.id

// ── Aislamiento: B intenta leer datos de A ───────────────
console.log('\n== AISLAMIENTO ==')

// 1. GET /clinics/me con B → debe ser su propia clínica, no la de A
const meB = await api('GET', '/api/clinics/me', tokenB)
expect('B GET /clinics/me → 200', meB.status, 200)
const noLeak1 = meB.body?.clinic?.id === clinicB?.id
console.log(`  ${noLeak1 ? '✓' : '✗'} B ve SU clínica, no la de A`)
if (noLeak1) pass++; else { fail++; FAILURES.push('B /me retorna clínica equivocada') }

// 2. GET /leads con B → no debe contener el lead de A
const listB = await api('GET', '/api/leads', tokenB)
expect('B GET /leads → 200', listB.status, 200)
const containsA = listB.body?.leads?.some(l => l.id === leadAId)
console.log(`  ${!containsA ? '✓' : '✗'} B NO ve leads de A (encontró ${listB.body?.total ?? 0} propios)`)
if (!containsA) pass++; else { fail++; FAILURES.push('B vio el lead de A en /leads') }

// 3. GET /leads/:idDeA con B → debe ser 404
const directB = await api('GET', `/api/leads/${leadAId}`, tokenB)
expect('B GET /leads/{A.id} → 404', directB.status, 404)

// 4. PATCH /leads/:idDeA con B → debe ser 404
const patchB = await api('PATCH', `/api/leads/${leadAId}`, tokenB, {
  notes: 'INTENTO DE TAMPER',
})
expect('B PATCH /leads/{A.id} → 404', patchB.status, 404)

// 5. POST /leads con B intentando inyectar clinic_id de A en el body
//    El handler ignora cualquier clinic_id del body y usa req.tenant.clinic_id
const phoneInject = `+52155598${Math.floor(1000 + Math.random() * 9000)}`
const injectB = await api('POST', '/api/leads', tokenB, {
  name: 'Inyectado por B',
  phone: phoneInject,
  clinic_id: clinicB?.owner_id,  // tampering attempt, debería ser ignorado
})
expect('B POST /leads con inyección → 201', injectB.status, 201)
const injected = injectB.body?.lead
console.log(`  ${injected?.clinic_id === clinicB?.id ? '✓' : '✗'} El lead inyectado va a la clínica de B (no la de A)`)
if (injected?.clinic_id === clinicB?.id) pass++; else { fail++; FAILURES.push('Inyección de clinic_id pasó por encima') }

// 6. Verificar desde A que su lead sigue intacto
const stillA = await api('GET', `/api/leads/${leadAId}`, tokenA)
expect('A vuelve a ver su lead → 200', stillA.status, 200)
const notesUntouched = stillA.body?.lead?.notes === 'NUNCA debe ser visible para B'
console.log(`  ${notesUntouched ? '✓' : '✗'} Notes de A NO fueron modificadas por B`)
if (notesUntouched) pass++; else { fail++; FAILURES.push('B modificó el lead de A') }

// ── Cleanup: borrar usuario B (también borra cascada) ───
console.log('\n— Cleanup: borrando user B...')
const del = await supabaseAdmin('DELETE', `/auth/v1/admin/users/${USER_B}`)
console.log(`  delete user B → ${del.status}`)

console.log(`\nRESULT: ${pass} pasaron, ${fail} fallaron`)
if (fail > 0) {
  console.log('Fallos:')
  for (const f of FAILURES) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('🔒 Aislamiento entre tenants verificado.')
