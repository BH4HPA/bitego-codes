import axios from 'axios';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function getErrorMessage(err: unknown, fallback = '请求失败') {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as unknown;
    if (isRecord(data) && typeof data.message === 'string' && data.message.trim()) return data.message;
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
    return fallback;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
