const fs = require('node:fs')
const path = require('node:path')

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function readFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((n) => n.endsWith('.ts'))
    .sort()
}

function getMatch(content, re) {
  const m = content.match(re)
  return m ? m[1] : null
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const className = getMatch(content, /export\s+class\s+([A-Za-z0-9_]+)\s+implements\s+MigrationInterface/)
  if (!className) fail(`migration file missing exported class: ${filePath}`)

  const nameValue =
    getMatch(content, /name\s*=\s*'([^']+)'/) ||
    getMatch(content, /name\s*=\s*"([^"]+)"/) ||
    getMatch(content, /this\.name\s*=\s*'([^']+)'/) ||
    getMatch(content, /this\.name\s*=\s*"([^"]+)"/)
  if (!nameValue) fail(`migration file missing name property: ${filePath}`)

  if (nameValue !== className)
    fail(`migration name mismatch: ${path.basename(filePath)} (${className} vs ${nameValue})`)

  if (!/\d{13}$/.test(className)) {
    fail(`migration class name must end with 13-digit timestamp: ${path.basename(filePath)} (${className})`)
  }
}

function main() {
  const dir = path.join(__dirname, '..', 'src', 'migrations')
  if (!fs.existsSync(dir)) fail(`migrations dir not found: ${dir}`)

  const files = readFiles(dir)
  if (!files.length) fail(`no migration files found in ${dir}`)

  for (const f of files) checkFile(path.join(dir, f))
  process.stdout.write(`OK: ${files.length} migrations validated\n`)
}

main()
