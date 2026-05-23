import { EventEmitter } from 'node:events'

const bus = new EventEmitter()
bus.setMaxListeners(200)

export type AdminNotificationEvent = { notificationId: string }

export function emitAdminNotification(e: AdminNotificationEvent) {
  bus.emit('admin_notification', e)
}

export function onAdminNotification(cb: (e: AdminNotificationEvent) => void) {
  bus.on('admin_notification', cb)
  return () => bus.off('admin_notification', cb)
}
