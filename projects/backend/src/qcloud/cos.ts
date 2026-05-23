import COS from 'cos-nodejs-sdk-v5'
import { config } from '../config'

export type CosPutResult = { ETag?: string; Location?: string }

let cos: COS | null = null

function getCos() {
  if (cos) return cos
  if (!config.cos.secretId || !config.cos.secretKey) throw new Error('COS credentials not configured')
  cos = new COS({ SecretId: config.cos.secretId, SecretKey: config.cos.secretKey })
  return cos
}

export function buildPublicUrl(key: string) {
  const normalizedKey = key.replace(/^\/+/, '')
  if (config.cos.cdnDomain) {
    const base = config.cos.cdnDomain.replace(/\/+$/, '')
    return `${base}/${normalizedKey}`
  }
  if (config.cos.bucket && config.cos.region) {
    return `https://${config.cos.bucket}.cos.${config.cos.region}.myqcloud.com/${normalizedKey}`
  }
  return normalizedKey
}

export async function cosPutObject(params: { key: string; body: Buffer; contentType: string; cacheControl?: string }) {
  const putOverride = globalThis.__COS_PUT_OBJECT__
  if (putOverride) return await putOverride(params)

  if (!config.cos.bucket || !config.cos.region) throw new Error('COS bucket/region not configured')
  const client = globalThis.__COS_CLIENT__ || getCos()
  return await new Promise<CosPutResult>((resolve, reject) => {
    client.putObject(
      {
        Bucket: config.cos.bucket,
        Region: config.cos.region,
        Key: params.key,
        Body: params.body,
        ContentLength: params.body.length,
        ContentType: params.contentType,
        CacheControl: params.cacheControl || 'public, max-age=31536000'
      },
      (err, data) => {
        if (err) {
          reject(err)
          return
        }
        const d = data as unknown as { ETag?: string; Location?: string } | undefined
        resolve({ ETag: d?.ETag, Location: d?.Location })
      }
    )
  })
}
