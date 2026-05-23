export class ApiRequestError extends Error {
  code: number;
  httpStatus: number;

  constructor(params: { message: string; code: number; httpStatus: number }) {
    super(params.message);
    this.code = params.code;
    this.httpStatus = params.httpStatus;
  }
}

export function getErrorMessage(err: unknown, fallback = "请求失败") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}
