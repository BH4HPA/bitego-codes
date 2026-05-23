export function formatDateTimeCompact(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date)
  const m: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') m[p.type] = p.value
  }
  return `${m.year}${m.month}${m.day}${m.hour}${m.minute}${m.second}`
}

export function nowShanghaiCompact() {
  return formatDateTimeCompact(new Date(), 'Asia/Shanghai')
}
