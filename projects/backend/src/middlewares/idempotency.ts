import { Request, Response, NextFunction } from 'express'
import { getRedis } from '../redis'
import { getAuthUser } from './auth'

export function requireIdempotency(ttlSeconds = 300) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = String(req.header('X-Request-Id') || '')
    if (!requestId) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing X-Request-Id', data: null })
      return
    }
    const user = getAuthUser(req)
    const userId = user?.userId || 'anonymous'
    const key = `idem:${req.method}:${req.path}:${userId}:${requestId}`
    const redis = getRedis()
    const cached = await redis.get(key)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        res.status(parsed.status || 200).json(parsed.body)
        return
      } catch {
        await redis.del(key)
      }
    }

    const originalJson = res.json.bind(res)
    res.json = (body: any) => {
      const status = res.statusCode || 200
      redis.set(key, JSON.stringify({ status, body }), { EX: ttlSeconds }).catch(() => null)
      return originalJson(body)
    }
    next()
  }
}
