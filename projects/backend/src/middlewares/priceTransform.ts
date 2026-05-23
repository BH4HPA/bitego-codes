import { NextFunction, Request, Response } from 'express'
import { PriceTransformer } from '../services/priceTransformer'

const moneyKeys = new Set([
  'price',
  'basePrice',
  'minPrice',
  'amount',
  'totalAmount',
  'paidAmount',
  'refundedAmount',
  'unitPriceSnapshot'
])

function transformInPlace(obj: any, fn: (k: string, v: any) => any) {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    for (const it of obj) transformInPlace(it, fn)
    return
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v && typeof v === 'object') transformInPlace(v, fn)
    obj[k] = fn(k, obj[k])
  }
}

function centsStringToYuan(v: any) {
  if (typeof v === 'string' && /^\d+$/.test(v)) return PriceTransformer.centsToYuanString(BigInt(v))
  return v
}

export function priceTransform(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res)
  res.json = (body: any) => {
    transformInPlace(body, (k, v) => {
      if (!moneyKeys.has(k)) return v
      return centsStringToYuan(v)
    })
    return originalJson(body)
  }
  next()
}
