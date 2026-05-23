type ConnCountEvent = { tableId: string; connCount: number }

const listeners = new Set<(e: ConnCountEvent) => void>()

export function emitConnCountChanged(e: ConnCountEvent) {
  for (const fn of listeners) fn(e)
}

export function onConnCountChanged(fn: (e: ConnCountEvent) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
