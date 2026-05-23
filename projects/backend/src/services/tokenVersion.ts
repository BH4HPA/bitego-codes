import { getRedis } from '../redis'

let memGtv = 1
const KEY_GTV = 'auth:globalTokenVersion'

export async function getGlobalTokenVersion(): Promise<number> {
  try {
    const redis = getRedis()
    if (!redis) return memGtv
    const v = await redis.get(KEY_GTV)
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    await redis.set(KEY_GTV, String(memGtv))
    return memGtv
  } catch {
    return memGtv
  }
}

export async function bumpGlobalTokenVersion(): Promise<number> {
  memGtv += 1
  try {
    const redis = getRedis()
    if (!redis) return memGtv
    const v = await redis.incr(KEY_GTV)
    return Number(v) || memGtv
  } catch {
    return memGtv
  }
}
