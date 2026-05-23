export class PriceTransformer {
  static toCents(input: unknown) {
    if (typeof input === 'bigint') return input
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new Error('Invalid price')
      if (Number.isInteger(input)) return BigInt(input)
      return PriceTransformer.yuanStringToCents(String(input))
    }
    if (typeof input === 'string') {
      const s = input.trim()
      if (!s) throw new Error('Invalid price')
      if (s.includes('.')) return PriceTransformer.yuanStringToCents(s)
      if (!/^[+-]?\d+$/.test(s)) throw new Error('Invalid price')
      return BigInt(s)
    }
    throw new Error('Invalid price')
  }

  static yuanStringToCents(yuan: string) {
    const s = yuan.trim()
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) throw new Error('Invalid price')
    const negative = s.startsWith('-')
    const raw = negative ? s.slice(1) : s
    const [intPart, fracPartRaw = ''] = raw.split('.')
    const frac = (fracPartRaw + '00').slice(0, 2)
    const cents = BigInt(intPart || '0') * 100n + BigInt(frac)
    return negative ? -cents : cents
  }

  static centsToYuanString(cents: bigint) {
    const negative = cents < 0n
    const abs = negative ? -cents : cents
    const intPart = abs / 100n
    const frac = abs % 100n
    const out = `${intPart.toString()}.${frac.toString().padStart(2, '0')}`
    return negative ? `-${out}` : out
  }
}
