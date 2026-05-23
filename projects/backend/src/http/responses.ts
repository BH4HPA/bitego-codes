import { Response } from 'express'

export function ok(res: Response, data: any = {}, message = 'Success') {
  res.json({ success: true, code: 0, message, data })
}

export function created(res: Response, data: any = {}, message = 'Created') {
  res.status(201).json({ success: true, code: 0, message, data })
}

export function accepted(res: Response, data: any = {}, message = 'Accepted') {
  res.status(202).json({ success: true, code: 0, message, data })
}

export function fail(res: Response, httpStatus: number, code: number, message: string) {
  res.status(httpStatus).json({ success: false, code, message, data: null })
}
