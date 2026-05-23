import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { AppDataSource } from '../db'
import { Table } from '../entities/Table'
import { Store } from '../entities/Store'
import { TableCart } from '../entities/TableCart'
import { TableCartItem } from '../entities/TableCartItem'
import { SKU } from '../entities/SKU'
import { Good } from '../entities/Good'
import { SpecGroup } from '../entities/SpecGroup'
import { SpecOption } from '../entities/SpecOption'
import { SharedSpecGroup } from '../entities/SharedSpecGroup'
import { SharedSpecOption } from '../entities/SharedSpecOption'
import { GoodSharedSpecGroup } from '../entities/GoodSharedSpecGroup'
import { genId } from '../utils/id'
import { getRedis } from '../redis'
import { emitConnCountChanged } from './connCountBus'
import { getMaintenanceState, getStoreMaintenanceState, onMaintenanceChanged } from '../services/maintenance'
import { getGlobalTokenVersion } from '../services/tokenVersion'
import { In, IsNull } from 'typeorm'
import crypto from 'crypto'

type Client = {
  ws: WebSocket
  tableId: string
  sessionVersion: number
  user: { userId: string; role: string; nickname?: string; avatarUrl?: string }
  cartId?: string
  cartVersion?: number
}

const clients = new Map<string, Set<Client>>()

function parseDefaultOptionIds(raw: unknown) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed.map((x) => String(x || '')).filter((x) => x) : []
  } catch {
    return []
  }
}

export function getTableConnCount(tableId: string) {
  return clients.get(tableId)?.size || 0
}

export function getAllTableConnCounts() {
  const out: Record<string, number> = {}
  for (const [tableId, set] of clients.entries()) out[tableId] = set.size
  return out
}

export function closeAllTableSessions() {
  for (const tableId of Array.from(clients.keys())) closeTableSession(tableId)
}

export async function closeTableSessionsForStore(storeId: string) {
  const repo = AppDataSource.getRepository(Table)
  const rows = await repo.find({ select: { tableId: true } as any, where: { storeId } as any })
  for (const r of rows) closeTableSession((r as any).tableId)
}

function decodeWsUser(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const userId = p.userId
  const role = p.role
  if (typeof userId !== 'string' || !userId) return null
  if (typeof role !== 'string' || !role) return null
  const nickname = typeof p.nickname === 'string' ? p.nickname : undefined
  const avatarUrl = typeof p.avatarUrl === 'string' ? p.avatarUrl : undefined
  return { userId, role, nickname, avatarUrl }
}

function decodeTokenVersion(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 1
  const p = payload as Record<string, unknown>
  const gtv = p.gtv
  if (typeof gtv === 'number' && Number.isFinite(gtv) && gtv > 0) return Math.floor(gtv)
  return 1
}

function decodeSession(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const tableId = p.tableId
  const sessionVersion = p.sessionVersion
  if (typeof tableId !== 'string' || !tableId) return null
  if (!Number.isInteger(sessionVersion)) return null
  return { tableId, sessionVersion: sessionVersion as number }
}

export function initTableSessionWSS() {
  const wss = new WebSocketServer({ noServer: true })
  onMaintenanceChanged((e) => {
    if (!e.enabled) return
    if (e.scope === 'platform') {
      closeAllTableSessions()
      return
    }
    if (e.scope === 'tenant') {
      void (async () => {
        const storeRepo = AppDataSource.getRepository(Store)
        const stores = await storeRepo.find({
          select: { storeId: true } as any,
          where: { tenantId: e.tenantId } as any
        })
        for (const s of stores) await closeTableSessionsForStore((s as any).storeId)
      })()
      return
    }
    if (e.scope === 'store') {
      void closeTableSessionsForStore(e.storeId)
    }
  })
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const maintenance = await getMaintenanceState()
    if (maintenance.enabled) {
      ws.send(JSON.stringify({ type: 'ERROR', data: { code: 50300, message: maintenance.message } }))
      ws.close()
      return
    }
    const url = new URL(req.url || '', 'http://localhost')
    const tableId = url.searchParams.get('tableId') || ''
    const sessionToken = url.searchParams.get('sessionToken') || ''
    const token = url.searchParams.get('token') || ''
    let userPayload: unknown
    try {
      userPayload = jwt.verify(token, config.jwtSecret)
    } catch {
      ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40100, message: 'Unauthorized' } }))
      ws.close()
      return
    }
    const gtv = decodeTokenVersion(userPayload)
    const cur = await getGlobalTokenVersion()
    if (gtv !== cur) {
      ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40100, message: 'Unauthorized' } }))
      ws.close()
      return
    }
    const wsUser = decodeWsUser(userPayload)
    if (!wsUser) {
      ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40100, message: 'Unauthorized' } }))
      ws.close()
      return
    }
    let payload: unknown
    try {
      payload = jwt.verify(sessionToken, config.jwtSecret)
    } catch {
      ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40002, message: 'Invalid session token' } }))
      ws.close()
      return
    }
    const session = decodeSession(payload)
    if (!session || session.tableId !== tableId) {
      ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40002, message: 'Invalid table session' } }))
      ws.close()
      return
    }
    const repo = AppDataSource.getRepository(Table)
    const t = await repo.findOne({ where: { tableId } })
    if (!t || t.sessionVersion !== session.sessionVersion) {
      ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40002, message: 'Table session closed' } }))
      ws.close()
      return
    }
    const storeMaintenance = await getStoreMaintenanceState(t.storeId)
    if (storeMaintenance.enabled) {
      ws.send(JSON.stringify({ type: 'ERROR', data: { code: 50300, message: storeMaintenance.message } }))
      ws.close()
      return
    }
    const set = clients.get(tableId) || new Set<Client>()
    const alreadyJoined = Array.from(set).some(
      (c) => c.user.userId === wsUser.userId && c.sessionVersion === t.sessionVersion
    )
    const client: Client = { ws, tableId, sessionVersion: t.sessionVersion, user: wsUser }
    set.add(client)
    clients.set(tableId, set)
    emitConnCountChanged({ tableId, connCount: set.size })
    const cartRepo = AppDataSource.getRepository(TableCart)
    const carts = await cartRepo.find({
      where: { tableId, sessionVersion: t.sessionVersion },
      order: { id: 'DESC' },
      take: 1
    })
    let cart = carts[0]
    if (!cart) {
      cart = cartRepo.create({
        cartId: genId('cart'),
        storeId: t.storeId,
        tableId,
        sessionVersion: t.sessionVersion,
        version: 1,
        openedAt: new Date()
      })
      await cartRepo.save(cart)
    }
    client.cartId = cart.cartId
    client.cartVersion = cart.version
    const itemRepo = AppDataSource.getRepository(TableCartItem)
    const items = await itemRepo.find({ where: { cartId: cart.cartId } })
    ws.send(
      JSON.stringify({
        type: 'CART_SNAPSHOT',
        version: cart.version,
        data: { cartId: cart.cartId, tableId, openedAt: cart.openedAt, updatedAt: new Date(), items }
      })
    )
    if (!alreadyJoined) {
      emitToTable(tableId, 'USER_JOINED', { userId: wsUser.userId, nickname: wsUser.nickname || '' })
    }
    ws.on('message', async (message: any) => {
      const raw = message?.toString?.() || ''
      if (raw === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }))
        return
      }
      let msg: any
      try {
        msg = JSON.parse(raw)
      } catch {
        ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40000, message: 'Invalid message' } }))
        return
      }
      if (msg?.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', ts: typeof msg?.ts === 'number' ? msg.ts : Date.now() }))
        return
      }
      if (msg?.type === 'SYNC') {
        const cartRepo = AppDataSource.getRepository(TableCart)
        const itemRepo = AppDataSource.getRepository(TableCartItem)
        const freshCart = await cartRepo.findOne({ where: { cartId: client.cartId } })
        if (!freshCart) {
          ws.send(JSON.stringify({ type: 'ERROR', data: { code: 50000, message: 'Cart not found' } }))
          return
        }
        cart.version = freshCart.version
        client.cartVersion = freshCart.version
        const items = await itemRepo.find({ where: { cartId: freshCart.cartId } })
        ws.send(
          JSON.stringify({
            type: 'CART_SNAPSHOT',
            version: freshCart.version,
            data: { cartId: freshCart.cartId, tableId, openedAt: freshCart.openedAt, updatedAt: new Date(), items }
          })
        )
        return
      }
      const { opId, opType, baseVersion, payload: pl } = msg
      if (!opId || typeof opId !== 'string') {
        ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40000, message: 'Invalid opId' } }))
        return
      }
      try {
        const redis = getRedis()
        const opKey = `wsop:${tableId}:${client.sessionVersion}:${opId}`
        const inserted = await redis.set(opKey, '1', { NX: true, EX: 300 })
        if (!inserted) {
          if (typeof client.cartVersion === 'number') cart.version = client.cartVersion
          const itemRepo = AppDataSource.getRepository(TableCartItem)
          const items = await itemRepo.find({ where: { cartId: cart.cartId } })
          ws.send(
            JSON.stringify({
              type: 'CART_UPDATED',
              version: cart.version,
              data: { cartId: cart.cartId, tableId, openedAt: cart.openedAt, updatedAt: new Date(), items }
            })
          )
          return
        }
      } catch {
        ws.send(JSON.stringify({ type: 'ERROR', data: { code: 50000, message: 'Internal Server Error' } }))
        return
      }
      const expectedVersion = typeof client.cartVersion === 'number' ? client.cartVersion : cart.version
      if (baseVersion !== expectedVersion) {
        ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40001, message: 'Version mismatch' } }))
        return
      }
      cart.version = expectedVersion
      const itemRepo2 = AppDataSource.getRepository(TableCartItem)
      if (opType === 'ADD_ITEM') {
        const skuId = pl?.skuId
        const qty = Math.max(1, parseInt(String(pl?.qty || '1'), 10) || 1)
        const rawNonStockSelections = (pl?.nonStockSelectionsByGroupId ||
          pl?.nonStockSelections ||
          pl?.selections) as unknown
        const nonStockSelectionsByGroupId: Record<string, string[]> = {}
        if (rawNonStockSelections && typeof rawNonStockSelections === 'object') {
          for (const [k, v] of Object.entries(rawNonStockSelections as Record<string, unknown>)) {
            if (!k) continue
            const arr = Array.isArray(v) ? (v as unknown[]) : []
            const ids = arr.map((x) => String(x || '')).filter((x) => x)
            if (ids.length) nonStockSelectionsByGroupId[String(k)] = Array.from(new Set(ids))
          }
        }
        if (!skuId || typeof skuId !== 'string') {
          ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40000, message: 'Invalid skuId' } }))
          return
        }
        const skuRepo = AppDataSource.getRepository(SKU)
        const goodRepo = AppDataSource.getRepository(Good)
        const sgRepo = AppDataSource.getRepository(SpecGroup)
        const soRepo = AppDataSource.getRepository(SpecOption)
        const sku = await skuRepo.findOne({ where: { skuId } })
        if (!sku || sku.status !== 'ON_SHELF') {
          ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40001, message: 'SKU not available' } }))
          return
        }
        if (sku.stock <= 0) {
          ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40001, message: 'Out of stock' } }))
          return
        }
        const good = await goodRepo.findOne({ where: { goodId: sku.goodId } })
        if (!good) {
          ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40001, message: 'Good not available' } }))
          return
        }
        const ssgRepo = AppDataSource.getRepository(SharedSpecGroup)
        const ssoRepo = AppDataSource.getRepository(SharedSpecOption)
        const linkRepo = AppDataSource.getRepository(GoodSharedSpecGroup)
        const nonStockGroups = await sgRepo.find({
          where: { goodId: sku.goodId, status: 'ACTIVE', isStock: 0 },
          order: { sort: 'DESC', id: 'ASC' }
        })
        const nonStockGroupIds = nonStockGroups.map((g) => g.specGroupId)
        const nonStockOptions = nonStockGroupIds.length
          ? await soRepo.find({ where: { specGroupId: In(nonStockGroupIds), status: 'ACTIVE' } })
          : []
        const sharedLinks = await linkRepo.find({ where: { goodId: sku.goodId } })
        const sharedIds = Array.from(new Set(sharedLinks.map((l) => l.sharedSpecGroupId)))
        const sharedGroups = sharedIds.length
          ? await ssgRepo.find({ where: { sharedSpecGroupId: In(sharedIds), status: 'ACTIVE' } })
          : []
        const sharedOptions = sharedIds.length
          ? await ssoRepo.find({ where: { sharedSpecGroupId: In(sharedIds), status: 'ACTIVE' } })
          : []
        const sharedById = new Map(sharedGroups.map((g) => [g.sharedSpecGroupId, g]))
        const groupById = new Map<
          string,
          {
            groupId: string
            name: string
            sort: number
            isRequired: number
            minSelection: number
            maxSelection: number
            defaultOptionIds: string[]
          }
        >()
        const optionById = new Map<string, { optionId: string; groupId: string; name: string; priceCents: string }>()
        const optCountByGroupId = new Map<string, number>()
        for (const g of nonStockGroups) {
          groupById.set(g.specGroupId, {
            groupId: g.specGroupId,
            name: g.name,
            sort: Number(g.sort || 0) || 0,
            isRequired: Number(g.isRequired || 0) || 0,
            minSelection: Number(g.minSelection || 0) || 0,
            maxSelection: Number(g.maxSelection || 0) || 0,
            defaultOptionIds: parseDefaultOptionIds((g as any).defaultOptionIds)
          })
        }
        for (const link of sharedLinks) {
          const g = sharedById.get(link.sharedSpecGroupId)
          if (!g) continue
          groupById.set(link.sharedSpecGroupId, {
            groupId: link.sharedSpecGroupId,
            name: g.name,
            sort: Number(link.sort || 0) || 0,
            isRequired: Number(g.isRequired || 0) || 0,
            minSelection: Number(g.minSelection || 0) || 0,
            maxSelection: Number(g.maxSelection || 0) || 0,
            defaultOptionIds: parseDefaultOptionIds(g.defaultOptionIds)
          })
        }
        for (const o of nonStockOptions) {
          optionById.set(o.optionId, {
            optionId: o.optionId,
            groupId: o.specGroupId,
            name: o.name,
            priceCents: String(o.priceCents || '0')
          })
          optCountByGroupId.set(o.specGroupId, (optCountByGroupId.get(o.specGroupId) || 0) + 1)
        }
        for (const o of sharedOptions) {
          optionById.set(o.optionId, {
            optionId: o.optionId,
            groupId: o.sharedSpecGroupId,
            name: o.name,
            priceCents: String(o.priceCents || '0')
          })
          optCountByGroupId.set(o.sharedSpecGroupId, (optCountByGroupId.get(o.sharedSpecGroupId) || 0) + 1)
        }
        const normalizedNonStockSelections: Record<string, string[]> = {}
        const allGroupIds = Array.from(groupById.keys())
        for (const gid of allGroupIds) {
          const g = groupById.get(gid)
          if (!g) continue
          const picked = Array.isArray(nonStockSelectionsByGroupId[gid]) ? nonStockSelectionsByGroupId[gid] : []
          const defaults = g.defaultOptionIds || []
          const effectivePicked = picked.length ? picked : defaults
          const valid = picked.filter((oid) => {
            const o = optionById.get(oid)
            return Boolean(o && o.groupId === gid)
          })
          const validDefaults = defaults.filter((oid) => {
            const o = optionById.get(oid)
            return Boolean(o && o.groupId === gid)
          })
          const uniqSource = effectivePicked.length ? (picked.length ? valid : validDefaults) : []
          const uniq = Array.from(new Set(uniqSource))
          const min = g.isRequired ? Math.max(1, Number(g.minSelection || 0)) : 0
          const max = Math.min(Math.max(min, Number(g.maxSelection || 0)), optCountByGroupId.get(gid) || 0)
          if (uniq.length < min || uniq.length > max) {
            ws.send(
              JSON.stringify({ type: 'ERROR', data: { code: 40000, message: 'Invalid non-stock option selection' } })
            )
            return
          }
          if (uniq.length) normalizedNonStockSelections[gid] = uniq.sort((a, b) => a.localeCompare(b))
        }
        const nonStockParts = Object.entries(normalizedNonStockSelections)
          .sort(([a], [b]) => {
            const sa = Number(groupById.get(a)?.sort || 0)
            const sb = Number(groupById.get(b)?.sort || 0)
            return sb - sa || a.localeCompare(b)
          })
          .map(([gid, oids]) => {
            const g = groupById.get(gid)
            const names = oids.map((oid) => optionById.get(oid)?.name).filter(Boolean) as string[]
            return g ? `${g.name}:${names.join('、')}` : null
          })
          .filter(Boolean) as string[]
        let addCents = 0n
        for (const [, oids] of Object.entries(normalizedNonStockSelections)) {
          for (const oid of oids) {
            const o = optionById.get(oid)
            if (o) addCents += BigInt(o.priceCents || '0')
          }
        }
        const unitPriceCents = (BigInt(String(sku.price || '0')) + addCents).toString()
        const segs: string[] = []
        const stockText = String(sku.specCombination || '').trim()
        if (stockText && stockText !== '默认') segs.push(stockText)
        segs.push(...nonStockParts)
        const specTextSnapshot = segs.length ? segs.join(' / ') : '默认'
        const nonStockSig =
          Object.entries(normalizedNonStockSelections)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([gid, oids]) => `${gid}:${oids.join(',')}`)
            .join(';') || 'default'
        const priceItemKey = crypto.createHash('sha256').update(`v1|${skuId}|${nonStockSig}`).digest('hex').slice(0, 16)
        const nonStockSelectionsSnapshot = Object.keys(normalizedNonStockSelections).length
          ? JSON.stringify(normalizedNonStockSelections)
          : null
        const priceItemSnapshot = JSON.stringify({
          version: 1,
          skuId,
          goodId: sku.goodId,
          stockSpecSignature: sku.specSignature || null,
          nonStockSelectionsByGroupId: normalizedNonStockSelections,
          nonStockAddPriceCents: addCents.toString(),
          unitPriceCents
        })
        const keyUser = client.user.userId
        let item = await itemRepo2.findOne({
          where: { cartId: cart.cartId, skuId, addedByUserId: keyUser, priceItemKey }
        })
        if (!item && nonStockSig === 'default') {
          item = await itemRepo2.findOne({
            where: { cartId: cart.cartId, skuId, addedByUserId: keyUser, priceItemKey: IsNull() }
          })
        }
        if (item) {
          if (!item.priceItemKey) item.priceItemKey = priceItemKey
          item.specTextSnapshot = specTextSnapshot
          item.unitPriceSnapshot = unitPriceCents
          item.nonStockSelectionsSnapshot = nonStockSelectionsSnapshot
          item.priceItemSnapshot = priceItemSnapshot
          item.qty = Math.min(sku.stock, item.qty + qty)
          await itemRepo2.save(item)
        } else {
          item = itemRepo2.create({
            cartItemId: genId('ci'),
            cartId: cart.cartId,
            skuId,
            goodId: sku.goodId,
            goodNameSnapshot: good.name,
            specTextSnapshot,
            unitPriceSnapshot: unitPriceCents,
            qty: Math.min(sku.stock, qty),
            priceItemKey,
            nonStockSelectionsSnapshot,
            priceItemSnapshot,
            addedByUserId: keyUser,
            addedByNicknameSnapshot: client.user.nickname || '',
            addedByAvatarSnapshot: client.user.avatarUrl || ''
          })
          await itemRepo2.save(item)
        }
      } else if (opType === 'UPDATE_QTY') {
        const id = pl?.cartItemId
        const qty = pl?.qty
        const item = await itemRepo2.findOne({ where: { cartItemId: id, cartId: cart.cartId } })
        if (!item) {
          ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40400, message: 'Cart item not found' } }))
          return
        }
        if (qty <= 0) {
          await itemRepo2.delete({ cartItemId: id })
        } else {
          const skuRepo = AppDataSource.getRepository(SKU)
          const sku = await skuRepo.findOne({ where: { skuId: item.skuId } })
          if (!sku) {
            ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40001, message: 'SKU not available' } }))
            return
          }
          item.qty = Math.min(sku.stock, qty)
          await itemRepo2.save(item)
        }
      } else if (opType === 'REMOVE_ITEM') {
        const id = pl?.cartItemId
        await itemRepo2.delete({ cartItemId: id })
      } else {
        ws.send(JSON.stringify({ type: 'ERROR', data: { code: 40000, message: 'Unknown op' } }))
        return
      }
      cart.version = cart.version + 1
      await cartRepo.save(cart)
      client.cartVersion = cart.version
      const items2 = await itemRepo2.find({ where: { cartId: cart.cartId } })
      const payloadOut = {
        type: 'CART_UPDATED',
        version: cart.version,
        data: { cartId: cart.cartId, tableId, openedAt: cart.openedAt, updatedAt: new Date(), items: items2 },
        actor: { userId: client.user.userId, nickname: client.user.nickname || '' }
      }
      const peers = clients.get(tableId)
      if (peers) {
        for (const c of peers) {
          c.cartId = cart.cartId
          c.cartVersion = cart.version
          c.ws.send(JSON.stringify(payloadOut))
        }
      }
    })
    ws.on('close', () => {
      const peers = clients.get(tableId)
      if (peers) {
        peers.delete(client)
        if (peers.size === 0) clients.delete(tableId)
        emitConnCountChanged({ tableId, connCount: peers.size })
      }
    })
  })
  return wss
}

export function closeTableSession(tableId: string) {
  const peers = clients.get(tableId)
  if (!peers) return
  for (const c of peers) {
    c.ws.send(JSON.stringify({ type: 'TABLE_CLOSED', data: { tableId } }))
    c.ws.close()
    setTimeout(() => {
      if (c.ws.readyState !== WebSocket.CLOSED && c.ws.readyState !== WebSocket.CLOSING) {
        try {
          c.ws.terminate()
        } catch {}
      }
    }, 1000)
  }
  clients.delete(tableId)
}

export function emitToTable(tableId: string, type: string, data: any) {
  const peers = clients.get(tableId)
  if (!peers) return
  const payload = JSON.stringify({ type, data })
  for (const c of peers) {
    c.ws.send(payload)
  }
}

export function emitCartUpdated(
  tableId: string,
  params: { cartId: string; openedAt: Date; items: TableCartItem[]; version: number }
) {
  const peers = clients.get(tableId)
  if (!peers) return
  const payloadOut = JSON.stringify({
    type: 'CART_UPDATED',
    version: params.version,
    data: { cartId: params.cartId, tableId, openedAt: params.openedAt, updatedAt: new Date(), items: params.items }
  })
  for (const c of peers) {
    c.cartId = params.cartId
    c.cartVersion = params.version
    c.ws.send(payloadOut)
  }
}
