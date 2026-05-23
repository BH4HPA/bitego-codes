import crypto from 'node:crypto'

type HashParts = {
  saltB64: string
  hashB64: string
  N: number
  r: number
  p: number
  keyLen: number
}

function parseHash(stored: string): HashParts | null {
  const s = String(stored || '')
  const parts = s.split('$')
  if (parts.length !== 7) return null
  const [algo, N, r, p, keyLen, saltB64, hashB64] = parts
  if (algo !== 'scrypt') return null
  const n = Number(N)
  const rr = Number(r)
  const pp = Number(p)
  const kl = Number(keyLen)
  if (!Number.isFinite(n) || !Number.isFinite(rr) || !Number.isFinite(pp) || !Number.isFinite(kl)) return null
  if (!saltB64 || !hashB64) return null
  return { saltB64, hashB64, N: n, r: rr, p: pp, keyLen: kl }
}

export function hashPassword(password: string) {
  const pwd = String(password || '')
  const salt = crypto.randomBytes(16)
  const N = 16384
  const r = 8
  const p = 1
  const keyLen = 32
  const key = crypto.scryptSync(pwd, salt, keyLen, { N, r, p })
  return `scrypt$${N}$${r}$${p}$${keyLen}$${salt.toString('base64')}$${key.toString('base64')}`
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false
  const parts = parseHash(storedHash)
  if (!parts) return false
  const salt = Buffer.from(parts.saltB64, 'base64')
  const expected = Buffer.from(parts.hashB64, 'base64')
  const actual = crypto.scryptSync(String(password || ''), salt, parts.keyLen, { N: parts.N, r: parts.r, p: parts.p })
  if (expected.length !== actual.length) return false
  return crypto.timingSafeEqual(expected, actual)
}

export function hasStoredPassword(storedHash: string | null | undefined) {
  return !!storedHash && parseHash(storedHash) !== null
}
