import { config } from '../config'
import { getRedis, withRedisLock } from '../redis'

type WechatStableTokenResp = {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getWechatMiniProgramAccessToken(): Promise<string> {
  if (!config.wechatMiniProgram.appId || !config.wechatMiniProgram.secret)
    throw new Error('WeChat credentials not configured')

  const redis = getRedis()
  const cacheKey = `wechat:miniapp:access_token:${config.wechatMiniProgram.appId}`
  const cached = await redis.get(cacheKey)
  if (cached) return cached

  for (let i = 0; i < 20; i += 1) {
    const locked = await withRedisLock(cacheKey, 10_000, async () => {
      const doubleCheck = await redis.get(cacheKey)
      if (doubleCheck) return doubleCheck

      const fetcher = globalThis.__WX_FETCH__ || fetch
      const resp = await fetcher('https://api.weixin.qq.com/cgi-bin/stable_token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credential',
          appid: config.wechatMiniProgram.appId,
          secret: config.wechatMiniProgram.secret
        })
      })
      const data = (await resp.json()) as WechatStableTokenResp
      if (!resp.ok) throw new Error(`WeChat stable_token HTTP ${resp.status}`)
      if (data.errcode && data.errcode !== 0)
        throw new Error(`WeChat stable_token error: ${data.errcode} ${data.errmsg || ''}`.trim())
      if (!data.access_token || !data.expires_in) throw new Error('WeChat stable_token missing fields')

      const ttlSeconds = Math.max(1, Math.floor(data.expires_in - 300))
      await redis.set(cacheKey, data.access_token, { EX: ttlSeconds })
      return data.access_token
    })

    if (locked) return locked
    const recheck = await redis.get(cacheKey)
    if (recheck) return recheck
    await sleep(100)
  }

  const fetcher = globalThis.__WX_FETCH__ || fetch
  const resp = await fetcher('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid: config.wechatMiniProgram.appId,
      secret: config.wechatMiniProgram.secret
    })
  })
  const data = (await resp.json()) as WechatStableTokenResp
  if (!resp.ok) throw new Error(`WeChat stable_token HTTP ${resp.status}`)
  if (data.errcode && data.errcode !== 0)
    throw new Error(`WeChat stable_token error: ${data.errcode} ${data.errmsg || ''}`.trim())
  if (!data.access_token || !data.expires_in) throw new Error('WeChat stable_token missing fields')

  const ttlSeconds = Math.max(1, Math.floor(data.expires_in - 300))
  await redis.set(cacheKey, data.access_token, { EX: ttlSeconds })
  return data.access_token
}
