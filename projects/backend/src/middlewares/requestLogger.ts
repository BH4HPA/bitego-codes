import { Request, Response, NextFunction } from 'express'

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const payload = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms
    }
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  })
  next()
}
