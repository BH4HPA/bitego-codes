const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch, loginAdmin, bearerAuthz } = require('./testUtils')

test('env ADMIN_PASSWORD does not silently reset a changed admin password', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
      const { User } = require('../dist/entities/User')
      const userRepo = AppDataSource.getRepository(User)

      const envUser = process.env.ADMIN_USERNAME || 'admin'
      const envPass = process.env.ADMIN_PASSWORD || 'admin'

      // 1) Bootstrap admin via env defaults.
      const seed = await loginAdmin(base, envUser, envPass)
      assert.equal(seed.resp.status, 200)
      const seedToken = seed.json.data.token
      assert.ok(seedToken)

      // 2) Change the admin password.
      const newPass = 'new-secure-pass-123'
      const change = await jsonFetch(`${base}/api/v1/admin/me/password`, {
        method: 'PUT',
        headers: { ...bearerAuthz(seedToken), 'content-type': 'application/json' },
        body: JSON.stringify({ oldPassword: envPass, newPassword: newPass })
      })
      assert.equal(change.resp.status, 200)

      const afterChange = await userRepo.findOne({ where: { userId: 'admin_1' } })
      assert.ok(afterChange)
      const hashAfterChange = afterChange.passwordHash
      assert.ok(hashAfterChange)

      // 3) Logging in with the env default must now fail AND must not touch the stored hash.
      const stale = await loginAdmin(base, envUser, envPass)
      assert.equal(stale.resp.status, 401)

      const afterStaleAttempt = await userRepo.findOne({ where: { userId: 'admin_1' } })
      assert.ok(afterStaleAttempt)
      assert.equal(
        afterStaleAttempt.passwordHash,
        hashAfterChange,
        'env-default login must not overwrite the real admin password hash'
      )

      // 4) The real new password still works.
      const fresh = await loginAdmin(base, envUser, newPass)
      assert.equal(fresh.resp.status, 200)
      assert.ok(fresh.json.data.token)
    },
    null,
    async (ctx) => {
      // Clear the bootstrap admin hash so later tests re-seed via env defaults.
      try {
        const { User } = require('../dist/entities/User')
        const userRepo = ctx.AppDataSource.getRepository(User)
        await userRepo.update({ userId: 'admin_1' }, { passwordHash: null })
      } catch {}
    }
  )
})

test('env credentials never seed a sibling ADMIN row with null hash', async () => {
  const siblingId = `admin_sibling_${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(
    async ({ base, AppDataSource }) => {
      const { User } = require('../dist/entities/User')
      const { AdminScope } = require('../dist/entities/AdminScope')
      const userRepo = AppDataSource.getRepository(User)
      const scopeRepo = AppDataSource.getRepository(AdminScope)

      const envUser = process.env.ADMIN_USERNAME || 'admin'
      const envPass = process.env.ADMIN_PASSWORD || 'admin'

      // Seed admin_1 with a real (non-default) password.
      const seed = await loginAdmin(base, envUser, envPass)
      assert.equal(seed.resp.status, 200)
      const seedToken = seed.json.data.token
      const realPass = 'real-admin-password-9z'
      const change = await jsonFetch(`${base}/api/v1/admin/me/password`, {
        method: 'PUT',
        headers: { ...bearerAuthz(seedToken), 'content-type': 'application/json' },
        body: JSON.stringify({ oldPassword: envPass, newPassword: realPass })
      })
      assert.equal(change.resp.status, 200)
      const adminOneBefore = await userRepo.findOne({ where: { userId: 'admin_1' } })
      assert.ok(adminOneBefore && adminOneBefore.passwordHash)
      const adminOneHashBefore = adminOneBefore.passwordHash

      // Insert a rogue ADMIN row with username === envUser but a null/invalid hash.
      // This simulates the post-restore / manual-repair scenario Codex flagged: env
      // credentials must not be allowed to claim this row and inherit SUPER_ADMIN.
      //
      // TypeORM entity has no uniqueness on username, so two rows can coexist; we
      // also rename admin_1.username first to avoid MySQL unique-index surprises in
      // environments where a migration added one.
      await userRepo.update({ userId: 'admin_1' }, { username: 'admin_real' })
      try {
        await userRepo.save(
          userRepo.create({
            userId: siblingId,
            userType: 'ADMIN',
            username: envUser,
            passwordHash: null,
            wechatOpenid: null,
            wechatUnionid: null,
            nickname: 'rogue',
            avatarUrl: '',
            phoneNumber: null,
            status: 'ACTIVE',
            lastLoginAt: null
          })
        )

        const attempt = await loginAdmin(base, envUser, envPass)
        assert.equal(
          attempt.resp.status,
          401,
          'env credentials must be rejected when admin_1 already has a real password, even if another ADMIN row has null hash'
        )

        // Neither row should have been modified by the attempt.
        const adminOneAfter = await userRepo.findOne({ where: { userId: 'admin_1' } })
        assert.ok(adminOneAfter)
        assert.equal(adminOneAfter.passwordHash, adminOneHashBefore)

        const siblingAfter = await userRepo.findOne({ where: { userId: siblingId } })
        assert.ok(siblingAfter)
        assert.equal(siblingAfter.passwordHash, null, 'sibling row must not be seeded by env credentials')

        const siblingScopes = await scopeRepo.find({ where: { userId: siblingId } })
        assert.equal(siblingScopes.length, 0, 'sibling row must not be granted any scope by env credentials')
      } finally {
        await scopeRepo.delete({ userId: siblingId })
        await userRepo.delete({ userId: siblingId })
      }
    },
    null,
    async (ctx) => {
      try {
        const { User } = require('../dist/entities/User')
        const { AdminScope } = require('../dist/entities/AdminScope')
        const userRepo = ctx.AppDataSource.getRepository(User)
        const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
        await scopeRepo.delete({ userId: siblingId })
        await userRepo.delete({ userId: siblingId })
        // Restore admin_1 to its pristine bootstrap state so later tests re-seed cleanly.
        await userRepo.update({ userId: 'admin_1' }, { username: 'admin', passwordHash: null })
      } catch {}
    }
  )
})
