import { config } from './config'
import { AppDataSource } from './db'
import http from 'http'
import { initTableSessionWSS } from './ws/tableSession'
import { initAdminDashboardWSS } from './ws/adminDashboard'
import { createApp } from './app'
import { initRedis } from './redis'
import { startRefundWorker } from './workers/refundWorker'
import { startStoreSyncWorker } from './workers/storeSyncWorker'

async function bootstrap() {
  await initRedis()
  await AppDataSource.initialize()
  const app = createApp()

  const server = http.createServer(app)

  const tableWss = initTableSessionWSS()
  const adminWss = initAdminDashboardWSS()

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || ''
    const index = url.indexOf('?')
    const pathname = index !== -1 ? url.slice(0, index) : url

    if (pathname === '/ws/table-session') {
      tableWss.handleUpgrade(req, socket as any, head, (ws) => tableWss.emit('connection', ws, req))
      return
    }
    if (pathname === '/ws/admin-dashboard') {
      adminWss.handleUpgrade(req, socket as any, head, (ws) => adminWss.emit('connection', ws, req))
      return
    }
    socket.destroy()
  })

  startRefundWorker()
  startStoreSyncWorker()

  server.listen(config.port, () => {
    process.stdout.write(`Backend listening on port ${config.port}\n`)
  })
}

bootstrap().catch((err: any) => {
  const msg = err?.message ? String(err.message) : 'Unknown error'
  process.stderr.write(`BOOTSTRAP_FAILED: ${msg}\n`)
  process.exit(1)
})
