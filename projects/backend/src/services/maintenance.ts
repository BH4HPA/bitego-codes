import { getRedis } from '../redis'
import { EventEmitter } from 'events'

let memEnabled = false
let memMessage = '系统维护中，请稍后重试'
const memTenant = new Map<string, { enabled: boolean; message: string }>()
const memStore = new Map<string, { enabled: boolean; message: string }>()

const KEY_ENABLED = 'maintenance:enabled'
const KEY_MESSAGE = 'maintenance:message'
const keyTenantEnabled = (tenantId: string) => `maintenance:tenant:${tenantId}:enabled`
const keyTenantMessage = (tenantId: string) => `maintenance:tenant:${tenantId}:message`
const keyStoreEnabled = (storeId: string) => `maintenance:store:${storeId}:enabled`
const keyStoreMessage = (storeId: string) => `maintenance:store:${storeId}:message`

export type MaintenanceState = { enabled: boolean; message: string }

type MaintenanceScope =
  | { scope: 'platform' }
  | { scope: 'tenant'; tenantId: string }
  | { scope: 'store'; storeId: string }

const bus = new EventEmitter()
bus.setMaxListeners(50)

export function onMaintenanceChanged(cb: (e: MaintenanceScope & MaintenanceState) => void) {
  bus.on('change', cb)
  return () => bus.off('change', cb)
}

function emitChange(e: MaintenanceScope & MaintenanceState) {
  bus.emit('change', e)
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  try {
    const redis = getRedis()
    if (!redis) return { enabled: memEnabled, message: memMessage }
    const [enabled, message] = await redis.mGet([KEY_ENABLED, KEY_MESSAGE])
    const en = String(enabled || '').toLowerCase()
    return { enabled: en === '1' || en === 'true', message: String(message || memMessage) }
  } catch {
    return { enabled: memEnabled, message: memMessage }
  }
}

export async function setMaintenanceState(enabled: boolean, message?: string) {
  const msg = (message || '').trim() || memMessage
  memEnabled = enabled
  memMessage = msg
  emitChange({ scope: 'platform', enabled, message: msg })
  try {
    const redis = getRedis()
    if (!redis) return
    await redis.mSet({ [KEY_ENABLED]: enabled ? '1' : '0', [KEY_MESSAGE]: msg })
  } catch {
    return
  }
}

export async function getTenantMaintenanceState(tenantId: string): Promise<MaintenanceState> {
  const cached = memTenant.get(tenantId)
  const fallback = cached || { enabled: false, message: memMessage }
  try {
    const redis = getRedis()
    if (!redis) return fallback
    const [enabled, message] = await redis.mGet([keyTenantEnabled(tenantId), keyTenantMessage(tenantId)])
    const en = String(enabled || '').toLowerCase()
    return { enabled: en === '1' || en === 'true', message: String(message || fallback.message) }
  } catch {
    return fallback
  }
}

export async function setTenantMaintenanceState(tenantId: string, enabled: boolean, message?: string) {
  const msg = (message || '').trim() || memMessage
  memTenant.set(tenantId, { enabled, message: msg })
  emitChange({ scope: 'tenant', tenantId, enabled, message: msg })
  try {
    const redis = getRedis()
    if (!redis) return
    await redis.mSet({ [keyTenantEnabled(tenantId)]: enabled ? '1' : '0', [keyTenantMessage(tenantId)]: msg })
  } catch {
    return
  }
}

export async function getStoreMaintenanceState(storeId: string): Promise<MaintenanceState> {
  const cached = memStore.get(storeId)
  const fallback = cached || { enabled: false, message: memMessage }
  try {
    const redis = getRedis()
    if (!redis) return fallback
    const [enabled, message] = await redis.mGet([keyStoreEnabled(storeId), keyStoreMessage(storeId)])
    const en = String(enabled || '').toLowerCase()
    return { enabled: en === '1' || en === 'true', message: String(message || fallback.message) }
  } catch {
    return fallback
  }
}

export async function setStoreMaintenanceState(storeId: string, enabled: boolean, message?: string) {
  const msg = (message || '').trim() || memMessage
  memStore.set(storeId, { enabled, message: msg })
  emitChange({ scope: 'store', storeId, enabled, message: msg })
  try {
    const redis = getRedis()
    if (!redis) return
    await redis.mSet({ [keyStoreEnabled(storeId)]: enabled ? '1' : '0', [keyStoreMessage(storeId)]: msg })
  } catch {
    return
  }
}
