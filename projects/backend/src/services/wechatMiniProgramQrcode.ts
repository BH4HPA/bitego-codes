import { config } from '../config'
import { cosPutObject, buildPublicUrl } from '../qcloud/cos'
import { getWechatMiniProgramAccessToken } from './wechatAccessToken'

type WechatErrorResp = {
  errcode?: number
  errmsg?: string
}

function ensureHttps(url: string) {
  if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`
  return url
}

export async function generateTableMiniProgramQrcode(params: {
  tableId: string
  envVersion?: 'release' | 'trial' | 'develop'
}) {
  const scene = `tableId=${params.tableId}`
  if (scene.length > 32) throw new Error('WeChat scene too long')
  if (!config.wechatMiniProgram.qrcodePagePath) throw new Error('WeChat qrcode page not configured')

  const envVersion = params.envVersion || config.wechatMiniProgram.envVersion

  const accessToken = await getWechatMiniProgramAccessToken()
  const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`

  const fetcher = globalThis.__WX_FETCH__ || fetch
  const resp = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scene,
      page: config.wechatMiniProgram.qrcodePagePath,
      env_version: envVersion,
      width: 430,
      check_path: false
    })
  })

  const buf = Buffer.from(await resp.arrayBuffer())
  const contentType = resp.headers.get('content-type') || ''
  if (!resp.ok) throw new Error(`WeChat getwxacodeunlimit HTTP ${resp.status}`)
  if (contentType.includes('application/json')) {
    const err = JSON.parse(buf.toString('utf8')) as WechatErrorResp
    throw new Error(`WeChat getwxacodeunlimit error: ${err.errcode} ${err.errmsg || ''}`.trim())
  }

  const key = `qrcode/table/${params.tableId}_${Date.now()}.png`
  await cosPutObject({ key, body: buf, contentType: 'image/png', cacheControl: 'public, max-age=31536000' })
  const publicUrl = ensureHttps(buildPublicUrl(key))
  if (!publicUrl.startsWith('https://')) throw new Error('COS public url not configured')
  return { key, publicUrl }
}
