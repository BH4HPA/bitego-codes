export class AppError extends Error {
  httpStatus: number
  code: number

  constructor(httpStatus: number, code: number, message: string) {
    super(message)
    this.httpStatus = httpStatus
    this.code = code
  }
}

export function badRequest(message: string, code = 40000) {
  return new AppError(400, code, message)
}

export function businessError(message: string, code = 40001) {
  return new AppError(400, code, message)
}

export function unauthorized(message = 'Unauthorized', code = 40100) {
  return new AppError(401, code, message)
}

export function forbidden(message = 'Forbidden', code = 40300) {
  return new AppError(403, code, message)
}

export function notFound(message = 'Not Found', code = 40400) {
  return new AppError(404, code, message)
}
