import crypto from 'crypto'

export type OptionGroupInput = {
  id?: string
  name: string
  isStock?: boolean
  sort?: number
  defaultOptionIds?: string[]
  options: Array<{
    id?: string
    name: string
    priceCents: bigint
  }>
  isRequired: boolean
  minSelection: number
  maxSelection: number
}

export type GeneratedSku = {
  specKey: string
  specSignature: string
  specText: string
  priceCents: bigint
  optionIds: string[]
}

function stableHash(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16)
}

export class SkuGenerator {
  static validateOptionGroups(groups: OptionGroupInput[]) {
    if (!Array.isArray(groups)) return { ok: false as const, message: 'optionGroups must be an array' }
    for (const g of groups) {
      if (!g || typeof g.name !== 'string' || !g.name.trim())
        return { ok: false as const, message: 'Invalid optionGroups.name' }
      if (!Array.isArray(g.options) || g.options.length === 0)
        return { ok: false as const, message: 'Invalid optionGroups.options' }
      if (typeof g.isRequired !== 'boolean') return { ok: false as const, message: 'Invalid optionGroups.isRequired' }
      if (!Number.isInteger(g.minSelection) || !Number.isInteger(g.maxSelection))
        return { ok: false as const, message: 'Invalid optionGroups selection limits' }
      if (g.minSelection < 0 || g.maxSelection < 0 || g.minSelection > g.maxSelection)
        return { ok: false as const, message: 'Invalid optionGroups selection limits' }
      if (g.isRequired && g.minSelection === 0)
        return { ok: false as const, message: 'Required group must have minSelection >= 1' }
      if (!g.isRequired && g.minSelection !== 0)
        return { ok: false as const, message: 'Optional group must have minSelection = 0' }
      if (g.maxSelection > g.options.length)
        return { ok: false as const, message: 'Invalid optionGroups selection limits' }
      for (const o of g.options) {
        if (!o || typeof o.name !== 'string' || !o.name.trim())
          return { ok: false as const, message: 'Invalid optionGroups.options.name' }
        if (typeof o.priceCents !== 'bigint')
          return { ok: false as const, message: 'Invalid optionGroups.options.priceCents' }
        if (o.priceCents < 0n) return { ok: false as const, message: 'Option price must be >= 0' }
      }
    }
    return { ok: true as const }
  }

  static generate(
    basePriceCents: bigint,
    groups: Array<{
      id: string
      name: string
      isRequired: boolean
      minSelection: number
      maxSelection: number
      options: Array<{ id: string; name: string; priceCents: bigint }>
    }>
  ) {
    const pickGroupCombinations = (g: (typeof groups)[number]) => {
      const opts = g.options.map((o) => ({
        groupId: g.id,
        groupName: g.name,
        optionId: o.id,
        optionName: o.name,
        priceCents: o.priceCents
      }))
      const min = g.isRequired ? Math.max(1, g.minSelection) : 0
      const max = Math.min(g.maxSelection, opts.length)
      const out: Array<Array<(typeof opts)[number]>> = []

      const choose = (k: number, start: number, acc: Array<(typeof opts)[number]>) => {
        if (acc.length === k) {
          out.push(acc)
          return
        }
        for (let i = start; i < opts.length; i += 1) choose(k, i + 1, [...acc, opts[i]])
      }

      for (let k = min; k <= max; k += 1) {
        if (k === 0) out.push([])
        else choose(k, 0, [])
      }
      return out
    }

    const selections = groups.map((g) => pickGroupCombinations(g))

    const out: GeneratedSku[] = []
    const walk = (
      idx: number,
      acc: Array<
        Array<{ groupId: string; groupName: string; optionId: string; optionName: string; priceCents: bigint }>
      >
    ) => {
      if (idx >= selections.length) {
        const pickedGroups = acc.filter((x) => x.length > 0)
        const specText = pickedGroups.length
          ? pickedGroups.map((ps) => `${ps[0].groupName}:${ps.map((p) => p.optionName).join('、')}`).join(' / ')
          : '默认'

        const optionIds = pickedGroups.flatMap((ps) => ps.map((p) => p.optionId))
        const groupParts = pickedGroups.map(
          (ps) =>
            `${ps[0].groupId}:${ps
              .map((p) => p.optionId)
              .sort()
              .join(',')}`
        )
        const specSignature = groupParts.length ? groupParts.join(';') : 'default'
        const specKey = stableHash(specSignature)
        const priceCents = pickedGroups.flat().reduce((sum, p) => sum + p.priceCents, basePriceCents)
        out.push({ specKey, specSignature, specText, priceCents, optionIds })
        return
      }
      for (const picked of selections[idx]) walk(idx + 1, [...acc, picked])
    }
    walk(0, [])
    const seen = new Set<string>()
    return out.filter((s) => {
      if (seen.has(s.specKey)) return false
      seen.add(s.specKey)
      return true
    })
  }
}
