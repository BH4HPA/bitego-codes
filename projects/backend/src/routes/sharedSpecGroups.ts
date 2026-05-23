import { Router } from 'express'
import { AppDataSource } from '../db'
import { asyncHandler } from '../http/asyncHandler'
import { created, ok } from '../http/responses'
import { requireAuth, requireAdmin } from '../middlewares/auth'
import { getAdminContext, requireAdminContext } from '../middlewares/adminAuthz'
import { isPrimaryStore, recordStoreSyncChange } from '../services/storeSyncChangeService'
import { genId } from '../utils/id'
import { SharedSpecGroup } from '../entities/SharedSpecGroup'
import { SharedSpecOption } from '../entities/SharedSpecOption'
import { GoodSharedSpecGroup } from '../entities/GoodSharedSpecGroup'
import { Good } from '../entities/Good'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { In } from 'typeorm'

const router = Router()

async function resolveTenantAndStore(params: { tenantId: string; storeId: string | null }) {
  const tenantRepo = AppDataSource.getRepository(Tenant)
  const tenant = await tenantRepo.findOne({ where: { tenantId: params.tenantId } })
  if (!tenant || tenant.deletedAt) {
    return { tenant: null, storeId: null }
  }
  const storeId = params.storeId || tenant.primaryStoreId || null
  return { tenant, storeId }
}

function parseDefaultOptionIds(raw: unknown) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((x) => String(x || '')).filter((x) => x)))
  }
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed.map((x) => String(x || '')).filter((x) => x) : []
  } catch {
    return []
  }
}

function normalizeOptions(input: unknown) {
  if (!Array.isArray(input)) return null
  const options: Array<{ optionId: string; name: string; priceCents: string; sort: number }> = []
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i] || {}
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name) return null
    let priceCents = '0'
    if (raw.priceCents !== undefined) {
      const n = typeof raw.priceCents === 'string' ? Number(raw.priceCents) : raw.priceCents
      if (!Number.isSafeInteger(n) || n < 0) return null
      priceCents = String(n)
    }
    const optionId =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : typeof raw.optionId === 'string' && raw.optionId.trim()
          ? raw.optionId.trim()
          : genId('sso')
    options.push({ optionId, name, priceCents, sort: (input.length - i) * 10 })
  }
  return options
}

function normalizeGroupInput(body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return null
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const isRequired = Boolean(body?.isRequired)
  const minSelectionRaw = Number(body?.minSelection || 0) || 0
  const minSelection = isRequired ? Math.max(1, minSelectionRaw) : Math.max(0, minSelectionRaw)
  const maxSelection = Math.max(minSelection, Number(body?.maxSelection || 0) || 0)
  const options = normalizeOptions(body?.options)
  if (!options || !options.length) return null
  if (maxSelection > options.length) return null
  const defaultOptionIds = parseDefaultOptionIds(body?.defaultOptionIds)
  if (defaultOptionIds.length) {
    const allowed = new Set(options.map((o) => o.optionId))
    const valid = defaultOptionIds.filter((id) => allowed.has(id))
    if (!valid.length || valid.length !== defaultOptionIds.length) return null
    if (valid.length > maxSelection || valid.length < minSelection) return null
  }
  return {
    name,
    description: description || null,
    isRequired,
    minSelection,
    maxSelection,
    defaultOptionIds,
    options
  }
}

router.get(
  '/api/v1/shared-spec-groups',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    const resolved = await resolveTenantAndStore({ tenantId: ctx.tenantId, storeId: ctx.storeId })
    if (!resolved.tenant || !resolved.storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    const status = typeof req.query.status === 'string' ? req.query.status : 'ACTIVE'
    const repo = AppDataSource.getRepository(SharedSpecGroup)
    const optRepo = AppDataSource.getRepository(SharedSpecOption)
    const linkRepo = AppDataSource.getRepository(GoodSharedSpecGroup)
    const storeId = resolved.storeId
    const groups = await repo.find({ where: { status, storeId }, order: { sort: 'DESC', id: 'ASC' } })
    const ids = groups.map((g) => g.sharedSpecGroupId)
    const options = ids.length ? await optRepo.find({ where: { sharedSpecGroupId: In(ids), status: 'ACTIVE' } }) : []
    const optionsByGroupId = new Map<string, SharedSpecOption[]>()
    for (const o of options) {
      const arr = optionsByGroupId.get(o.sharedSpecGroupId) || []
      arr.push(o)
      optionsByGroupId.set(o.sharedSpecGroupId, arr)
    }
    const links = ids.length ? await linkRepo.find({ where: { storeId, sharedSpecGroupId: In(ids) } }) : []
    const countById = new Map<string, number>()
    for (const l of links) countById.set(l.sharedSpecGroupId, (countById.get(l.sharedSpecGroupId) || 0) + 1)
    ok(res, {
      list: groups.map((g) => ({
        sharedSpecGroupId: g.sharedSpecGroupId,
        name: g.name,
        description: g.description || null,
        isRequired: Boolean(g.isRequired),
        minSelection: g.minSelection,
        maxSelection: g.maxSelection,
        sort: g.sort,
        defaultOptionIds: parseDefaultOptionIds(g.defaultOptionIds),
        status: g.status,
        goodsCount: countById.get(g.sharedSpecGroupId) || 0,
        options: (optionsByGroupId.get(g.sharedSpecGroupId) || [])
          .slice()
          .sort((a, b) => Number(b.sort || 0) - Number(a.sort || 0) || a.optionId.localeCompare(b.optionId))
          .map((o) => ({
            id: o.optionId,
            name: o.name,
            priceCents: Number(String(o.priceCents || '0')),
            sort: o.sort
          }))
      }))
    })
  })
)

router.get(
  '/api/v1/shared-spec-groups/:sharedSpecGroupId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { sharedSpecGroupId } = req.params
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    const resolved = await resolveTenantAndStore({ tenantId: ctx.tenantId, storeId: ctx.storeId })
    if (!resolved.tenant || !resolved.storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    const repo = AppDataSource.getRepository(SharedSpecGroup)
    const optRepo = AppDataSource.getRepository(SharedSpecOption)
    const linkRepo = AppDataSource.getRepository(GoodSharedSpecGroup)
    const goodRepo = AppDataSource.getRepository(Good)
    const storeId = resolved.storeId
    const g = await repo.findOne({ where: { sharedSpecGroupId, storeId } })
    if (!g) {
      res.status(404).json({ success: false, code: 40400, message: 'Shared spec group not found', data: null })
      return
    }
    const options = await optRepo.find({
      where: { sharedSpecGroupId, status: 'ACTIVE' },
      order: { sort: 'DESC', id: 'ASC' }
    })
    const links = await linkRepo.find({ where: { storeId, sharedSpecGroupId } })
    const goodIds = links.map((l) => l.goodId)
    const goods = goodIds.length ? await goodRepo.find({ where: { goodId: In(goodIds) } }) : []
    ok(res, {
      sharedSpecGroupId: g.sharedSpecGroupId,
      name: g.name,
      description: g.description || null,
      isRequired: Boolean(g.isRequired),
      minSelection: g.minSelection,
      maxSelection: g.maxSelection,
      sort: g.sort,
      defaultOptionIds: parseDefaultOptionIds(g.defaultOptionIds),
      status: g.status,
      goods: goods.map((x) => ({ goodId: x.goodId, name: x.name })),
      options: options.map((o) => ({
        id: o.optionId,
        name: o.name,
        price: String(o.priceCents || '0'),
        priceCents: Number(String(o.priceCents || '0')),
        sort: o.sort
      }))
    })
  })
)

router.post(
  '/api/v1/shared-spec-groups',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const payload = normalizeGroupInput(req.body || {})
    if (!payload) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    const resolved = await resolveTenantAndStore({ tenantId: ctx.tenantId, storeId: ctx.storeId })
    if (!resolved.tenant || !resolved.storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    if (!ctx.canManageSharedCatalog) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const storeId = resolved.storeId
    const okPrimary = await isPrimaryStore({ manager: AppDataSource.manager, tenantId: ctx.tenantId, storeId })
    if (!okPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const sharedSpecGroupId = genId('ssg')
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SharedSpecGroup)
      const optRepo = manager.getRepository(SharedSpecOption)
      const row = repo.create({
        sharedSpecGroupId,
        storeId,
        templateId: null,
        name: payload.name,
        description: payload.description,
        isRequired: payload.isRequired ? 1 : 0,
        minSelection: payload.minSelection,
        maxSelection: payload.maxSelection,
        sort: Number(req.body?.sort || 0) || 0,
        defaultOptionIds: payload.defaultOptionIds.length ? JSON.stringify(payload.defaultOptionIds) : null,
        status: 'ACTIVE'
      })
      await repo.save(row)
      await optRepo.insert(
        payload.options.map((o) => ({
          optionId: o.optionId,
          sharedSpecGroupId,
          templateId: null,
          name: o.name,
          priceCents: o.priceCents,
          sort: o.sort,
          status: 'ACTIVE'
        }))
      )

      if (ctx && storeId) {
        const okPrimary = await isPrimaryStore({ manager, tenantId: ctx.tenantId, storeId })
        if (okPrimary) {
          await recordStoreSyncChange({
            manager,
            tenantId: ctx.tenantId,
            sourceStoreId: storeId,
            entityType: 'SHARED_SPEC_GROUP',
            entityTemplateId: row.templateId || row.sharedSpecGroupId,
            action: 'UPSERT',
            name: row.name,
            changedByUserId: (req as any)?.user?.userId || null
          })
        }
      }
    })
    created(res, { sharedSpecGroupId }, 'Created')
  })
)

router.put(
  '/api/v1/shared-spec-groups/:sharedSpecGroupId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { sharedSpecGroupId } = req.params
    const payload = normalizeGroupInput(req.body || {})
    if (!payload) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    const resolved = await resolveTenantAndStore({ tenantId: ctx.tenantId, storeId: ctx.storeId })
    if (!resolved.tenant || !resolved.storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    if (!ctx.canManageSharedCatalog) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const storeId = resolved.storeId
    const okPrimary = await isPrimaryStore({ manager: AppDataSource.manager, tenantId: ctx.tenantId, storeId })
    if (!okPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SharedSpecGroup)
      const optRepo = manager.getRepository(SharedSpecOption)
      const g = await repo.findOne({ where: { sharedSpecGroupId, storeId } })
      if (!g) {
        res.status(404).json({ success: false, code: 40400, message: 'Shared spec group not found', data: null })
        return
      }
      g.name = payload.name
      g.description = payload.description
      g.isRequired = payload.isRequired ? 1 : 0
      g.minSelection = payload.minSelection
      g.maxSelection = payload.maxSelection
      g.sort = Number(req.body?.sort || g.sort) || 0
      g.defaultOptionIds = payload.defaultOptionIds.length ? JSON.stringify(payload.defaultOptionIds) : null
      g.status = 'ACTIVE'
      await repo.save(g)

      const existing = await optRepo.find({ where: { sharedSpecGroupId } })
      const existingById = new Map(existing.map((o) => [o.optionId, o]))
      const nextIds = new Set(payload.options.map((o) => o.optionId))
      const toInactive = existing.filter((o) => !nextIds.has(o.optionId))
      if (toInactive.length) {
        for (const o of toInactive) o.status = 'INACTIVE'
        await optRepo.save(toInactive)
      }
      const toSave: SharedSpecOption[] = []
      for (const o of payload.options) {
        const row =
          existingById.get(o.optionId) || optRepo.create({ optionId: o.optionId, sharedSpecGroupId, templateId: null })
        row.name = o.name
        row.priceCents = o.priceCents
        row.sort = o.sort
        row.status = 'ACTIVE'
        toSave.push(row)
      }
      await optRepo.save(toSave)

      if (ctx && storeId) {
        const okPrimary = await isPrimaryStore({ manager, tenantId: ctx.tenantId, storeId })
        if (okPrimary) {
          await recordStoreSyncChange({
            manager,
            tenantId: ctx.tenantId,
            sourceStoreId: storeId,
            entityType: 'SHARED_SPEC_GROUP',
            entityTemplateId: g.templateId || g.sharedSpecGroupId,
            action: 'UPSERT',
            name: g.name,
            changedByUserId: (req as any)?.user?.userId || null
          })
        }
      }
    })
    if (res.headersSent) return
    ok(res, { sharedSpecGroupId }, 'Updated')
  })
)

router.delete(
  '/api/v1/shared-spec-groups/:sharedSpecGroupId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { sharedSpecGroupId } = req.params
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    const resolved = await resolveTenantAndStore({ tenantId: ctx.tenantId, storeId: ctx.storeId })
    if (!resolved.tenant || !resolved.storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    if (!ctx.canManageSharedCatalog) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const storeId = resolved.storeId
    const okPrimary = await isPrimaryStore({ manager: AppDataSource.manager, tenantId: ctx.tenantId, storeId })
    if (!okPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SharedSpecGroup)
      const optRepo = manager.getRepository(SharedSpecOption)
      const linkRepo = manager.getRepository(GoodSharedSpecGroup)
      const g = await repo.findOne({ where: { sharedSpecGroupId, storeId } })
      if (!g) {
        res.status(404).json({ success: false, code: 40400, message: 'Shared spec group not found', data: null })
        return
      }
      const count = await linkRepo.count({ where: { storeId, sharedSpecGroupId } })
      if (count > 0) {
        res.status(400).json({ success: false, code: 40000, message: 'Shared spec group is in use', data: null })
        return
      }
      g.status = 'INACTIVE'
      await repo.save(g)
      const opts = await optRepo.find({ where: { sharedSpecGroupId } })
      if (opts.length) {
        for (const o of opts) o.status = 'INACTIVE'
        await optRepo.save(opts)
      }

      if (ctx && storeId) {
        const okPrimary = await isPrimaryStore({ manager, tenantId: ctx.tenantId, storeId })
        if (okPrimary) {
          await recordStoreSyncChange({
            manager,
            tenantId: ctx.tenantId,
            sourceStoreId: storeId,
            entityType: 'SHARED_SPEC_GROUP',
            entityTemplateId: g.templateId || g.sharedSpecGroupId,
            action: 'DELETE',
            name: g.name,
            changedByUserId: (req as any)?.user?.userId || null
          })
        }
      }
    })
    if (res.headersSent) return
    ok(res, { sharedSpecGroupId }, 'Deleted')
  })
)

export default router
