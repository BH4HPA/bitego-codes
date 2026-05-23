import { Request, Response, NextFunction } from 'express'
import { AppError } from '../http/errors'

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const httpStatus = typeof err?.httpStatus === 'number' ? err.httpStatus : 500
  const code = typeof err?.code === 'number' ? err.code : 50000
  const message = typeof err?.message === 'string' ? err.message : 'Internal Server Error'

  if (httpStatus >= 500) {
    const payload = {
      ts: new Date().toISOString(),
      type: 'UNHANDLED_ERROR',
      path: req.originalUrl,
      name: err?.name,
      message,
      stack: err?.stack
    }
    process.stderr.write(`${JSON.stringify(payload)}\n`)
  }

  if (err instanceof AppError) {
    res.status(httpStatus).json({ success: false, code, message, data: null })
    return
  }

  res.status(httpStatus).json({ success: false, code, message, data: null })
}
