// Smoke test del Día 4: appointments + conversations
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const envFile = readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8')
function envVal(key) {
  const match = envFile.match(new RegExp(`^${key}=(.+)$`, 'm'))
  return match?.[1]?.trim() ?? ''
}

const API = 'https://api.celura.clinic'
const JWT_SECRET = envVal('JWT_SECRET')
const USER_ID = 'a93b1bb7-7028-4b80-9804-28e1eae9a0f7'

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64url(sig)}`
}
const now = Math.floor(Date.now() / 1000)
const token = signJWT(
  { sub: USER_ID, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 },
  JWT_SECRET,
)
const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let parsed
  try { parsed = await res.json() } catch { parsed = null }
  console.log(`${method} ${path} → ${res.status}`)
  if (parsed) console.log(JSON.stringify(parsed, null, 2).slice(0, 600))
  console.log('---')
  return { status: res.status, body: parsed }
}

// ── 1. Crear un lead para vincular la cita ──────────────────
const phone = '+52155500' + Math.floor(1000 + Math.random() * 9000)
const lead = await call('POST', '/api/leads', {
  name: 'Paciente Smoke Day4', phone, treatment_interest: 'implantes',
})
const leadId = lead.body?.lead?.id

// ── 2. Crear una cita a futuro (mañana 10am UTC) ────────────
const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
tomorrow.setHours(10, 0, 0, 0)

const appt = await call('POST', '/api/appointments', {
  lead_id: leadId,
  scheduled_at: tomorrow.toISOString(),
  duration_min: 45,
  treatment: 'implantes dentales',
  notes: 'Primera consulta',
})
const apptId = appt.body?.appointment?.id

// ── 3. Listar citas ─────────────────────────────────────────
await call('GET', '/api/appointments?order=upcoming')

// ── 4. Detalle de la cita ────────────────────────────────────
if (apptId) await call('GET', `/api/appointments/${apptId}`)

// ── 5. Confirmar la cita ────────────────────────────────────
if (apptId) await call('PATCH', `/api/appointments/${apptId}`, { status: 'confirmed' })

// ── 6. Marcar attended → el lead debe subir a "attended" ────
if (apptId) await call('PATCH', `/api/appointments/${apptId}`, { status: 'attended' })

// ── 7. Verificar que el lead subió a "attended" ─────────────
if (leadId) {
  const l = await call('GET', `/api/leads/${leadId}`)
  const stage = l.body?.lead?.stage
  console.log(`Lead stage after attended: ${stage} ${stage === 'attended' ? '✓' : '✗'}`)
}

// ── 8. Conversaciones (vacía, pero debe responder 200) ──────
if (leadId) await call('GET', `/api/leads/${leadId}/conversation`)
await call('GET', '/api/conversations?limit=5')

// ── 9. Crear segunda cita y cancelarla (DELETE) ─────────────
const nextWeek = new Date()
nextWeek.setDate(nextWeek.getDate() + 7)
nextWeek.setHours(14, 0, 0, 0)
const appt2 = await call('POST', '/api/appointments', {
  lead_id: leadId,
  scheduled_at: nextWeek.toISOString(),
  treatment: 'blanqueamiento',
})
const appt2Id = appt2.body?.appointment?.id
if (appt2Id) {
  const del = await call('DELETE', `/api/appointments/${appt2Id}`)
  console.log(`DELETE appointment → ${del.body?.appointment?.status === 'cancelled' ? '✓ cancelled' : '✗'}`)
}

console.log('\nSmoke Day 4 completo.')
