const { spawnSync } = require('node:child_process')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  return typeof r.status === 'number' ? r.status : 1
}

function dockerUp() {
  console.log('======================')
  console.log('starting docker services')
  console.log('======================')
  return run('docker', ['compose', '-f', '../../docker-compose.yml', 'up', '-d', '--wait', 'mysql', 'redis'], {
    cwd: __dirname + '/..'
  })
}

function build() {
  console.log('======================')
  console.log('building backend')
  console.log('======================')
  return run('yarn', ['build'], { cwd: __dirname + '/..' })
}

async function main() {
  const mode = process.argv[2]
  const inner = mode === 'coverage' ? ['test:coverage:inner'] : mode === 'test' ? ['test:inner'] : null
  if (!inner) throw new Error('usage: node scripts/runTestsWithStoreSnapshot.js test|coverage')

  const upCode = dockerUp()
  if (upCode !== 0) process.exit(upCode)

  const buildCode = build()
  if (buildCode !== 0) process.exit(buildCode)

  let testExitCode = 1
  try {
    const saveCode = run('node', ['scripts/testStoreSnapshot.js', 'save'], { cwd: __dirname + '/..' })
    if (saveCode !== 0) process.exit(saveCode)

    testExitCode = run('yarn', inner, { cwd: __dirname + '/..' })
  } finally {
    run('node', ['scripts/testStoreSnapshot.js', 'restore'], { cwd: __dirname + '/..' })
  }

  console.log('======================')
  console.log('test completed')
  console.log('======================')
  process.exit(testExitCode)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
