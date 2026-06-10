// ============================================================
//  CELURA · Servicio de encriptación AES-256-GCM
//  Protege las API keys de Claude y ElevenLabs de los doctores.
//  Se encriptan antes de guardar en DB, se descifran en memoria.
// ============================================================

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16  // bytes
const TAG_LENGTH = 16 // bytes auth tag de GCM

function getKey(): Buffer {
  const hex = process.env['ENCRYPTION_KEY']
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes). Generala con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encripta un string con AES-256-GCM.
 * Retorna: iv:tag:ciphertext (todo en hex, separado por ":")
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Descifra un string encriptado con encrypt().
 * Lanza error si la clave o los datos son incorrectos.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(':')

  if (parts.length !== 3) {
    throw new Error('Formato de ciphertext inválido')
  }

  const [ivHex, tagHex, encHex] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

/**
 * Verifica si un string ya está encriptado (formato iv:tag:data)
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  return parts.length === 3 &&
    (parts[0]?.length ?? 0) === 32 &&   // iv hex = 16 bytes = 32 chars
    (parts[1]?.length ?? 0) === 32       // tag hex = 16 bytes = 32 chars
}

/**
 * Helper: encripta solo si no está ya encriptado
 */
export function safeEncrypt(value: string): string {
  if (isEncrypted(value)) return value
  return encrypt(value)
}

/**
 * Enmascara una API key para mostrar en el panel
 * "sk-ant-api03-xxxx...xxxx" → "sk-ant-...xxxx"
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}
