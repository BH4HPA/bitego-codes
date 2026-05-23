import { Router } from 'express'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { config } from '../config'
import { AppDataSource } from '../db'
import { User } from '../entities/User'
import { genId } from '../utils/id'
import jwt from 'jsonwebtoken'
import { getRedis } from '../redis'
import { getGlobalTokenVersion } from '../services/tokenVersion'

type WechatCode2SessionResp = {
  openid?: string
  session_key?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

const router = Router()

router.post(
  '/api/v1/auth/wechat/login',
  asyncHandler(async (req, res) => {
    const { code, nickname, avatarUrl } = req.body || {}
    if (!code || typeof code !== 'string') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid code', data: null })
      return
    }
    if (!config.wechatMiniProgram.appId || !config.wechatMiniProgram.secret) {
      res.status(500).json({ success: false, code: 50000, message: 'WeChat credentials not configured', data: null })
      return
    }

    const redis = getRedis()
    const codeKey = `wxcode:${code}`
    const locked = await redis.set(codeKey, '1', { NX: true, EX: 300 })
    if (!locked) {
      res.status(400).json({ success: false, code: 40001, message: 'Code already used', data: null })
      return
    }

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.searchParams.set('appid', config.wechatMiniProgram.appId)
    url.searchParams.set('secret', config.wechatMiniProgram.secret)
    url.searchParams.set('js_code', code)
    url.searchParams.set('grant_type', 'authorization_code')

    let wx: WechatCode2SessionResp
    try {
      const fetcher = globalThis.__WX_FETCH__ || fetch
      const resp = await fetcher(url.toString(), { method: 'GET' })
      wx = (await resp.json()) as WechatCode2SessionResp
    } catch (e: unknown) {
      const err = e as Record<string, unknown>
      process.stderr.write(
        `${JSON.stringify({ ts: new Date().toISOString(), type: 'WECHAT_CODE2SESSION_ERROR', message: String(err?.message || e) })}\n`
      )
      await redis.del(codeKey)
      res.status(500).json({ success: false, code: 50000, message: 'WeChat login failed', data: null })
      return
    }

    if (wx.errcode && wx.errcode !== 0) {
      process.stderr.write(
        `${JSON.stringify({ ts: new Date().toISOString(), type: 'WECHAT_CODE2SESSION_FAIL', errcode: wx.errcode, errmsg: wx.errmsg })}\n`
      )
      await redis.del(codeKey)
      res
        .status(400)
        .json({ success: false, code: 40001, message: `WeChat login failed: ${wx.errmsg || wx.errcode}`, data: null })
      return
    }

    const openid = wx.openid
    const sessionKey = wx.session_key
    if (!openid || !sessionKey) {
      await redis.del(codeKey)
      res.status(500).json({ success: false, code: 50000, message: 'WeChat login failed', data: null })
      return
    }

    const userRepo = AppDataSource.getRepository(User)
    let user: User | null = await userRepo.findOne({ where: { wechatOpenid: openid } })
    if (!user) {
      const createdUser = userRepo.create({
        userId: genId('usr'),
        userType: 'CUSTOMER',
        username: null,
        passwordHash: null,
        wechatOpenid: openid,
        wechatUnionid: wx.unionid || null,
        nickname: typeof nickname === 'string' ? nickname : null,
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: new Date()
      })
      await userRepo.save(createdUser)
      user = createdUser
    } else {
      let changed = false
      if (wx.unionid && user.wechatUnionid !== wx.unionid) {
        user.wechatUnionid = wx.unionid
        changed = true
      }
      if (typeof nickname === 'string' && nickname && user.nickname !== nickname) {
        user.nickname = nickname
        changed = true
      }
      if (typeof avatarUrl === 'string' && avatarUrl && user.avatarUrl !== avatarUrl) {
        user.avatarUrl = avatarUrl
        changed = true
      }
      user.lastLoginAt = new Date()
      changed = true
      if (changed) await userRepo.save(user)
    }

    if (!user) {
      res.status(500).json({ success: false, code: 50000, message: 'WeChat login failed', data: null })
      return
    }

    await redis.set(`wxsk:${user.userId}`, sessionKey, { EX: config.wechatMiniProgram.sessionKeyTtlSeconds })

    const gtv = await getGlobalTokenVersion()
    const token = jwt.sign(
      { role: 'CUSTOMER', userId: user.userId, nickname: user.nickname || '', avatarUrl: user.avatarUrl || '', gtv },
      config.jwtSecret,
      { expiresIn: '7d' }
    )
    ok(
      res,
      { token, user: { userId: user.userId, nickname: user.nickname || '', avatarUrl: user.avatarUrl || '' } },
      'Login successful.'
    )
  })
)

export default router
