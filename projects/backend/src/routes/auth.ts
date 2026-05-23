import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { ok } from '../http/responses'
import { requireAuth, getAuthUser } from '../middlewares/auth'
import { asyncHandler } from '../http/asyncHandler'
import { AppDataSource } from '../db'
import { User } from '../entities/User'
import { AdminScope } from '../entities/AdminScope'
import { hashPassword, hasStoredPassword, verifyPassword } from '../utils/password'
import { genId } from '../utils/id'
import { getGlobalTokenVersion } from '../services/tokenVersion'

const router = Router()

async function ensureEnvAdminSuperScope(userId: string) {
  const scopeRepo = AppDataSource.getRepository(AdminScope)
  const existedSuper = await scopeRepo
    .createQueryBuilder('sc')
    .where('sc.deletedAt IS NULL')
    .andWhere('sc.userId = :userId', { userId })
    .andWhere('sc.role = :role', { role: 'SUPER_ADMIN' })
    .andWhere('sc.status = :status', { status: 'ACTIVE' })
    .andWhere('sc.storeId IS NULL')
    .getOne()
  if (existedSuper) return
  const sc = scopeRepo.create({
    scopeId: genId('sc'),
    userId,
    tenantId: 'store_default',
    storeId: null,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE'
  })
  await scopeRepo.save(sc)
}

router.post(
  '/api/v1/auth/dev-token',
  asyncHandler(async (req, res) => {
    const {
      role = 'ADMIN',
      userId = role === 'ADMIN' ? 'admin_1' : 'usr_1',
      nickname = '用户',
      avatarUrl = ''
    } = req.body || {}
    const gtv = await getGlobalTokenVersion()
    const token = jwt.sign({ role, userId, nickname, avatarUrl, gtv }, config.jwtSecret, { expiresIn: '7d' })
    ok(res, { token })
  })
)

router.post(
  '/api/v1/auth/h5/login',
  asyncHandler(async (req, res) => {
    const rawUserId = req.body?.userId
    const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname : '顾客'
    const avatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl : ''
    const userId = typeof rawUserId === 'string' && rawUserId.trim() ? rawUserId.trim() : genId('usr')
    if (userId.length > 64) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid userId', data: null })
      return
    }

    const userRepo = AppDataSource.getRepository(User)
    let row = await userRepo.findOne({ where: { userId } })
    if (!row) {
      row = userRepo.create({
        userId,
        userType: 'CUSTOMER',
        username: null,
        passwordHash: null,
        wechatOpenid: null,
        wechatUnionid: null,
        nickname,
        avatarUrl,
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    }
    row.userType = 'CUSTOMER'
    if (!row.nickname) row.nickname = nickname
    if (row.avatarUrl === null) row.avatarUrl = avatarUrl
    row.lastLoginAt = new Date()
    await userRepo.save(row)

    const gtv = await getGlobalTokenVersion()
    const token = jwt.sign(
      { role: 'CUSTOMER', userId: row.userId, nickname: row.nickname || '', avatarUrl: row.avatarUrl || '', gtv },
      config.jwtSecret,
      { expiresIn: '30d' }
    )
    ok(res, { token, user: { userId: row.userId, nickname: row.nickname || '', avatarUrl: row.avatarUrl || '' } })
  })
)

router.post(
  '/api/v1/auth/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {}
    const u = String(username || '').trim()
    const p = String(password || '')
    if (!u || !p) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }

    const userRepo = AppDataSource.getRepository(User)
    const adminUser = process.env.ADMIN_USERNAME || 'admin'
    const adminPass = process.env.ADMIN_PASSWORD || 'admin'
    const row = await userRepo.findOne({ where: { username: u, userType: 'ADMIN' } })

    if (row && verifyPassword(p, row.passwordHash)) {
      row.lastLoginAt = new Date()
      await userRepo.save(row)
      if (u === adminUser) await ensureEnvAdminSuperScope(row.userId)
      const gtv = await getGlobalTokenVersion()
      const token = jwt.sign(
        { role: 'ADMIN', userId: row.userId, nickname: row.nickname || '', avatarUrl: row.avatarUrl || '', gtv },
        config.jwtSecret,
        { expiresIn: '7d' }
      )
      ok(res, { token })
      return
    }

    // Bootstrap/heal path: env ADMIN_USERNAME/ADMIN_PASSWORD may only act on the
    // canonical `admin_1` account, and only while it has no usable password hash
    // (fresh install, or a row whose hash is null/malformed). The check is gated
    // on admin_1 specifically — not on whichever row happens to match the username —
    // so a sibling ADMIN row with a null hash can never be seeded and granted
    // SUPER_ADMIN via env credentials.
    const adminOneRow = row?.userId === 'admin_1' ? row : await userRepo.findOne({ where: { userId: 'admin_1' } })
    const canBootstrap = u === adminUser && p === adminPass && !hasStoredPassword(adminOneRow?.passwordHash)

    if (!canBootstrap) {
      res.status(401).json({ success: false, code: 40100, message: 'Unauthorized', data: null })
      return
    }

    const base =
      adminOneRow ||
      userRepo.create({
        userId: 'admin_1',
        userType: 'ADMIN',
        username: adminUser,
        passwordHash: null,
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: '管理员',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    base.userType = 'ADMIN'
    base.username = adminUser
    base.passwordHash = hashPassword(p)
    if (!base.nickname) base.nickname = '管理员'
    if (base.avatarUrl === null) base.avatarUrl = ''
    base.lastLoginAt = new Date()
    await userRepo.save(base)

    await ensureEnvAdminSuperScope(base.userId)

    const gtv = await getGlobalTokenVersion()
    const token = jwt.sign(
      { role: 'ADMIN', userId: base.userId, nickname: base.nickname || '', avatarUrl: base.avatarUrl || '', gtv },
      config.jwtSecret,
      { expiresIn: '7d' }
    )
    ok(res, { token })
  })
)

router.get(
  '/api/v1/users/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req)
    if (!user) {
      res.status(401).json({ success: false, code: 40100, message: 'Unauthorized', data: null })
      return
    }
    const userRepo = AppDataSource.getRepository(User)
    let row = await userRepo.findOne({ where: { userId: user.userId } })
    if (!row) {
      row = userRepo.create({
        userId: user.userId || genId('usr'),
        userType: user.role,
        username: null,
        passwordHash: null,
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: user.nickname || '',
        avatarUrl: user.avatarUrl || '',
        phoneNumber: null,
        status: 'ACTIVE'
      })
      await userRepo.save(row)
    }
    ok(res, {
      userId: row.userId,
      userType: row.userType,
      username: row.username,
      nickname: row.nickname || '',
      avatarUrl: row.avatarUrl || '',
      lastLoginAt: row.lastLoginAt
    })
  })
)

export default router
