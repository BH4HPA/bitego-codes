import { createClient } from 'redis'
import { config } from './config'

let client: ReturnType<typeof createClient> | null = null

export async function initRedis() {
  if (client) return client
  client = createClient({ socket: { host: config.redis.host, port: config.redis.port } })
  client.on('error', (err) => {
    process.stderr.write(
      `${JSON.stringify({ ts: new Date().toISOString(), type: 'REDIS_ERROR', message: String(err?.message || err) })}\n`
    )
  })
  await client.connect()
  return client
}

export function getRedis() {
  if (!client) throw new Error('Redis not initialized')
  return client
}

export async function closeRedis() {
  if (!client) return
  const c = client
  client = null
  await c.quit()
}

export async function withRedisLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const redis = getRedis()
  const lockKey = `lock:${key}`
  const token = `${Date.now()}-${Math.random()}`
  const ok = await redis.set(lockKey, token, { NX: true, PX: ttlMs })
  if (!ok) return null
  try {
    return await fn()
  } finally {
    const cur = await redis.get(lockKey)
    if (cur === token) await redis.del(lockKey)
  }
}
