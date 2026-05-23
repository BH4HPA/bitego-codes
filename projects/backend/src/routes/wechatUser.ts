import { Router } from 'express'
import { requireAuth, getAuthUser } from '../middlewares/auth'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { getRedis } from '../redis'
import { config } from '../config'
import crypto from 'crypto'
import { AppDataSource } from '../db'
import { User } from '../entities/User'
import jwt from 'jsonwebtoken'
import { getGlobalTokenVersion } from '../services/tokenVersion'

const router = Router()

router.post(
  '/api/v1/users/me/phone',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req)
    if (!user) {
      res.status(401).json({ success: false, code: 40100, message: 'Unauthorized', data: null })
      return
    }
    const { encryptedData, iv } = req.body || {}
    if (!encryptedData || typeof encryptedData !== 'string' || !iv || typeof iv !== 'string') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    const redis = getRedis()
    const sessionKey = await redis.get(`wxsk:${user.userId}`)
    if (!sessionKey) {
      res.status(401).json({ success: false, code: 40101, message: 'Session expired, please login again', data: null })
      return
    }
    let decoded: unknown
    try {
      const sessionKeyBuf = Buffer.from(sessionKey, 'base64')
      const ivBuf = Buffer.from(iv, 'base64')
      const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKeyBuf, ivBuf)
      decipher.setAutoPadding(true)
      const decodedBuf = Buffer.concat([decipher.update(Buffer.from(encryptedData, 'base64')), decipher.final()])
      decoded = JSON.parse(decodedBuf.toString('utf8'))
    } catch (e: unknown) {
      const err = e as Record<string, unknown>
      process.stderr.write(
        `${JSON.stringify({ ts: new Date().toISOString(), type: 'WECHAT_DECRYPT_FAIL', message: String(err?.message || e) })}\n`
      )
      res.status(400).json({ success: false, code: 40001, message: 'Decrypt failed', data: null })
      return
    }
    const d = decoded as Record<string, unknown>
    const watermark = d?.watermark as Record<string, unknown> | undefined
    const appid = watermark?.appid
    if (!appid || appid !== config.wechatMiniProgram.appId) {
      res.status(400).json({ success: false, code: 40001, message: 'Invalid watermark', data: null })
      return
    }
    const phoneNumber = d?.phoneNumber
    if (typeof phoneNumber !== 'string' || !phoneNumber) {
      res.status(400).json({ success: false, code: 40001, message: 'Invalid phoneNumber', data: null })
      return
    }
    const userRepo = AppDataSource.getRepository(User)
    const row = await userRepo.findOne({ where: { userId: user.userId } })
    if (row) {
      row.phoneNumber = phoneNumber
      await userRepo.save(row)
    }
    ok(res, {
      phoneNumber,
      purePhoneNumber: String(d?.purePhoneNumber || ''),
      countryCode: String(d?.countryCode || '')
    })
  })
)

router.put(
  '/api/v1/users/me/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req)
    if (!user) {
      res.status(401).json({ success: false, code: 40100, message: 'Unauthorized', data: null })
      return
    }
    const { nickname, avatarUrl } = req.body || {}
    if (nickname === undefined && avatarUrl === undefined) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    const nick = typeof nickname === 'string' ? nickname.trim() : undefined
    let avatar = typeof avatarUrl === 'string' ? avatarUrl.trim() : undefined
    if (avatar && avatar.startsWith('`') && avatar.endsWith('`')) avatar = avatar.slice(1, -1).trim()
    if (nick !== undefined) {
      if (!nick || nick.length > 20) {
        res.status(400).json({ success: false, code: 40000, message: 'Invalid nickname', data: null })
        return
      }
    }
    if (avatar !== undefined) {
      if (avatar.length > 500) {
        res.status(400).json({ success: false, code: 40000, message: 'Invalid avatarUrl', data: null })
        return
      }
      if (
        avatar.startsWith('wxfile://') ||
        avatar.startsWith('file://') ||
        avatar.startsWith('http://tmp/') ||
        avatar.startsWith('https://tmp/')
      ) {
        res.status(400).json({ success: false, code: 40000, message: 'avatarUrl must be a public url', data: null })
        return
      }
    }
    const userRepo = AppDataSource.getRepository(User)
    let row = await userRepo.findOne({ where: { userId: user.userId } })
    if (!row) {
      row = userRepo.create({
        userId: user.userId,
        userType: user.role,
        username: null,
        passwordHash: null,
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: null,
        avatarUrl: null,
        phoneNumber: null,
        status: 'ACTIVE'
      })
    }
    if (nick !== undefined) row.nickname = nick
    if (avatar !== undefined) row.avatarUrl = avatar || null
    await userRepo.save(row)

    const gtv = await getGlobalTokenVersion()
    const token = jwt.sign(
      { role: user.role, userId: user.userId, nickname: row.nickname || '', avatarUrl: row.avatarUrl || '', gtv },
      config.jwtSecret,
      {
        expiresIn: '7d'
      }
    )
    ok(
      res,
      {
        token,
        user: { userId: user.userId, role: user.role, nickname: row.nickname || '', avatarUrl: row.avatarUrl || '' }
      },
      'Updated'
    )
  })
)

export default router
