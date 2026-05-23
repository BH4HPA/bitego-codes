import jwt from 'jsonwebtoken'
import { config } from '../config'
import { Request, Response, NextFunction } from 'express'
import { getGlobalTokenVersion } from '../services/tokenVersion'

export type AuthUser = { role: 'ADMIN' | 'CUSTOMER'; userId: string; nickname?: string; avatarUrl?: string }

function decodeAuthUser(payload: unknown): AuthUser | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const role = p.role
  const userId = p.userId
  if (role !== 'ADMIN' && role !== 'CUSTOMER') return null
  if (typeof userId !== 'string' || !userId) return null
  const nickname = typeof p.nickname === 'string' ? p.nickname : undefined
  const avatarUrl = typeof p.avatarUrl === 'string' ? p.avatarUrl : undefined
  return { role, userId, nickname, avatarUrl }
}

function decodeTokenVersion(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 1
  const p = payload as Record<string, unknown>
  const gtv = p.gtv
  if (typeof gtv === 'number' && Number.isFinite(gtv) && gtv > 0) return Math.floor(gtv)
  return 1
}

function setUser(req: Request, user: AuthUser) {
  ;(req as Request & { user?: AuthUser }).user = user
}

function readUser(req: Request): AuthUser | null {
  return (req as Request & { user?: AuthUser }).user || null
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ success: false, code: 40100, message: 'Unauthorized', data: null })
    return
  }
  const token = auth.slice(7)
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    const gtv = decodeTokenVersion(payload)
    const cur = await getGlobalTokenVersion()
    if (gtv !== cur) throw new Error('Token version mismatch')
    const user = decodeAuthUser(payload)
    if (!user) throw new Error('Invalid token payload')
    setUser(req, user)
    next()
  } catch {
    res.status(401).json({ success: false, code: 40101, message: 'Token expired or invalid', data: null })
  }
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    next()
    return
  }
  const token = auth.slice(7)
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    const gtv = decodeTokenVersion(payload)
    const cur = await getGlobalTokenVersion()
    if (gtv !== cur) throw new Error('Token version mismatch')
    const user = decodeAuthUser(payload)
    if (!user) throw new Error('Invalid token payload')
    setUser(req, user)
  } catch {
    res.status(401).json({ success: false, code: 40101, message: 'Token expired or invalid', data: null })
    return
  }
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = readUser(req)
  if (!user || user.role !== 'ADMIN') {
    res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
    return
  }
  next()
}

export function getAuthUser(req: Request): AuthUser | null {
  return readUser(req)
}
