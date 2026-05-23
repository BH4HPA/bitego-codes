import QRCode from 'qrcode'
import { config } from '../config'
import { buildPublicUrl, cosPutObject } from '../qcloud/cos'

export function buildTableH5Url(params: { tableId: string }) {
  if (!config.h5AppDomain) throw new Error('H5APP_DOMAIN not configured')
  const base = config.h5AppDomain.replace(/\/+$/, '')
  const tableId = encodeURIComponent(params.tableId)
  return `${base}/#/pages/order-meal/index?tableId=${tableId}`
}

export async function generateTableH5Qrcode(params: { tableId: string }) {
  const url = buildTableH5Url({ tableId: params.tableId })
  const png = await QRCode.toBuffer(url, { type: 'png', width: 512, margin: 1, errorCorrectionLevel: 'M' })
  const key = `table-h5-qrcodes/${params.tableId}_${Date.now()}.png`
  await cosPutObject({ key, body: png, contentType: 'image/png' })
  return { publicUrl: buildPublicUrl(key), key, url }
}
