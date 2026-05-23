const fs = require('node:fs/promises')
const path = require('node:path')

const SNAPSHOT_FILE = path.join(__dirname, '..', '.test-platform-snapshot.json')

async function saveSnapshot() {
  console.log('======================')
  console.log('saving snapshot')
  console.log('======================')
  const { withServer, getDevToken, jsonFetch } = require('../test/testUtils')
  let originalPut = null
  let captured = null
  await withServer(
    async ({ base, AppDataSource }) => {
      const userId = `u_snapshot_${Date.now()}`
      const token = await getDevToken(base, 'ADMIN', userId)
      const AdminScope = require('../dist/entities/AdminScope').AdminScope
      const scopeRepo = AppDataSource.getRepository(AdminScope)
      await scopeRepo.save(
        scopeRepo.create({
          scopeId: `sc_${Date.now()}`,
          userId,
          tenantId: 'store_default',
          storeId: null,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE'
        })
      )
      const { resp, json } = await jsonFetch(`${base}/api/v1/platform/snapshot/export`, {
        headers: { authorization: `Bearer ${token}` }
      })
      if (resp.status !== 200 || !json?.success) throw new Error('platform/snapshot/export failed')
      if (!captured?.body) throw new Error('snapshot body missing')
      await fs.writeFile(SNAPSHOT_FILE, captured.body)

      // With the snapshot safely persisted, null admin_1.passwordHash so every
      // test that relies on env-credential bootstrap (loginAdmin with
      // ADMIN_USERNAME/ADMIN_PASSWORD) starts from the "no real password yet"
      // state required by /auth/login. The post-test snapshot restore re-imports
      // platform.json, putting the operator's real admin hash back.
      const { User } = require('../dist/entities/User')
      const userRepo = AppDataSource.getRepository(User)
      await userRepo.update({ userId: 'admin_1' }, { passwordHash: null })
    },
    () => {
      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async (params) => {
        captured = params
        return { ETag: '"etag"', Location: `cos://${params.key}` }
      }
    },
    () => {
      globalThis.__COS_PUT_OBJECT__ = originalPut
    },
    { withDb: true, withRedis: true }
  )

  console.log('======================')
  console.log('snapshot saved')
  console.log('======================')
}

async function restoreSnapshot() {
  console.log('======================')
  console.log('restoring snapshot')
  console.log('======================')
  try {
    const buf = await fs.readFile(SNAPSHOT_FILE)
    const { withServer, getDevToken, jsonFetch } = require('../test/testUtils')
    await withServer(
      async ({ base, AppDataSource }) => {
        const userId = `u_snapshot_${Date.now()}`
        const token = await getDevToken(base, 'ADMIN', userId)
        const AdminScope = require('../dist/entities/AdminScope').AdminScope
        const scopeRepo = AppDataSource.getRepository(AdminScope)
        await scopeRepo.save(
          scopeRepo.create({
            scopeId: `sc_${Date.now()}`,
            userId,
            tenantId: 'store_default',
            storeId: null,
            role: 'SUPER_ADMIN',
            status: 'ACTIVE'
          })
        )
        const form = new FormData()
        form.append('file', new Blob([buf], { type: 'application/json' }), 'platform.json')
        const { resp, json } = await jsonFetch(`${base}/api/v1/platform/snapshot/import`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          body: form
        })
        if (resp.status !== 200 || !json?.success) throw new Error('platform/snapshot/import failed')
      },
      null,
      null,
      { withDb: true, withRedis: true }
    )
    await fs.unlink(SNAPSHOT_FILE).catch(() => null)
    console.log('======================')
    console.log('snapshot restored')
    console.log('======================')
  } catch (e) {
    console.log('======================')
    console.log('snapshot restore failed')
    console.log('======================')
    const code = e && typeof e === 'object' ? e.code : null
    if (code === 'ENOENT') return
    throw e
  }
}

async function main() {
  const cmd = process.argv[2]
  if (cmd === 'save') {
    await saveSnapshot()
    return
  }
  if (cmd === 'restore') {
    await restoreSnapshot()
    return
  }
  throw new Error('usage: node scripts/testStoreSnapshot.js save|restore')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
