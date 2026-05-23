const test = require('node:test')
const assert = require('node:assert/strict')

test('formatDateTimeCompact supports Asia/Shanghai timezone', () => {
  const { formatDateTimeCompact } = require('../dist/utils/time')
  const d = new Date('2026-01-01T00:00:00.000Z')
  const s = formatDateTimeCompact(d, 'Asia/Shanghai')
  assert.equal(s, '20260101080000')
})
