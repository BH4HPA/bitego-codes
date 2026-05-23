import { Router, Request, Response } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { requireAuth, getAuthUser } from '../middlewares/auth'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { config } from '../config'
import { buildPublicUrl, cosPutObject } from '../qcloud/cos'

const router = Router()

const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: config.cos.maxImageSizeBytes }
})

function normalizePath(input: unknown) {
  const raw = typeof input === 'string' ? input : ''
  const trimmed = raw.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!trimmed) return 'misc'
  if (trimmed.includes('..')) return 'misc'
  if (!/^[a-zA-Z0-9/_-]+$/.test(trimmed)) return 'misc'
  return trimmed
}

async function detectImageType(buffer: Buffer) {
  const mod = (await Function('return import("file-type")')()) as Promise<typeof import('file-type')>
  const res = await (await mod).fileTypeFromBuffer(buffer)
  return res as { ext: string; mime: string } | undefined
}

router.post(
  '/api/v1/files',
  requireAuth,
  (req, res, next) => {
    const handler = upload.single('file') as unknown as (
      req: Request,
      res: Response,
      next: (err?: unknown) => void
    ) => void
    handler(req, res, (err) => {
      if (!err) return next()
      const code = typeof err === 'object' && err ? (err as Record<string, unknown>).code : undefined
      if (code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ success: false, code: 41301, message: 'File too large', data: null })
        return
      }
      res.status(400).json({ success: false, code: 40000, message: 'Invalid upload request', data: null })
    })
  },
  asyncHandler(async (req, res) => {
    const file = req.file
    if (!file?.buffer) {
      res.status(400).json({ success: false, code: 40000, message: 'No file uploaded', data: null })
      return
    }
    const t = await detectImageType(file.buffer)
    const allowed = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
    if (!t || !allowed.has(t.ext)) {
      res.status(415).json({ success: false, code: 41501, message: 'Unsupported media type', data: null })
      return
    }

    const user = getAuthUser(req)
    const body = (req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}) as Record<
      string,
      unknown
    >
    const bizPath = user?.role === 'ADMIN' ? normalizePath(body.path) : 'avatars'
    const d = new Date()
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const uuid = crypto.randomUUID()
    const key =
      user?.role === 'ADMIN'
        ? `images/${bizPath}/${ymd}/${uuid}.${t.ext}`
        : `images/${bizPath}/${ymd}/${String(user?.userId || 'usr')}_${uuid}.${t.ext}`

    try {
      const r = await cosPutObject({ key, body: file.buffer, contentType: t.mime })
      ok(
        res,
        { key, etag: r.ETag || '', size: file.buffer.length, mime: t.mime, publicUrl: buildPublicUrl(key) },
        'Upload success'
      )
    } catch (e: unknown) {
      const err = e as Record<string, unknown>
      const payload = {
        ts: new Date().toISOString(),
        type: 'COS_UPLOAD_ERROR',
        name: err?.name,
        message: err?.message,
        code: err?.code,
        statusCode: err?.statusCode
      }
      process.stderr.write(`${JSON.stringify(payload)}\n`)
      const statusCode = typeof err?.statusCode === 'number' ? (err.statusCode as number) : 500
      if (statusCode === 403) {
        res.status(403).json({ success: false, code: 40301, message: 'COS access denied', data: null })
        return
      }
      if (statusCode === 404) {
        res.status(404).json({ success: false, code: 40401, message: 'COS bucket or region not found', data: null })
        return
      }
      if (statusCode === 503) {
        res.status(503).json({ success: false, code: 50301, message: 'COS service unavailable', data: null })
        return
      }
      res.status(500).json({ success: false, code: 50000, message: 'Failed to upload', data: null })
    }
  })
)

export default router
