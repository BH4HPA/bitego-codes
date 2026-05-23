import 'express-serve-static-core'

declare module 'express-serve-static-core' {
  interface Request {
    user?: { role: 'ADMIN' | 'CUSTOMER'; userId: string; nickname?: string; avatarUrl?: string }
  }
}
