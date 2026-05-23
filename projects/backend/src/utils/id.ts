export function genId(prefix: string): string {
  const ts = Date.now().toString(36)
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${ts}${rnd}`
}
