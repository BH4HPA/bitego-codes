import express from 'express'
import cors from 'cors'
import storesRouter from './routes/stores'
import tablesRouter from './routes/tables'
import ordersRouter from './routes/orders'
import categoriesRouter from './routes/categories'
import goodsRouter from './routes/goods'
import authRouter from './routes/auth'
import wechatAuthRouter from './routes/wechatAuth'
import wechatUserRouter from './routes/wechatUser'
import adminUsersRouter from './routes/adminUsers'
import adminNotificationsRouter from './routes/adminNotifications'
import adminScopesRouter from './routes/adminScopes'
import filesRouter from './routes/files'
import dashboardRouter from './routes/dashboard'
import sharedSpecGroupsRouter from './routes/sharedSpecGroups'
import tenantSyncRouter from './routes/tenantSync'
import platformBrandingRouter from './routes/platformBranding'
import platformTenantsRouter from './routes/platformTenants'
import platformStoresRouter from './routes/platformStores'
import tenantStoresRouter from './routes/tenantStores'
import overviewStoresRouter from './routes/overviewStores'
import tenantBrandingRouter from './routes/tenantBranding'
import platformUsersRouter from './routes/platformUsers'
import tenantUsersRouter from './routes/tenantUsers'
import storeUsersRouter from './routes/storeUsers'
import platformSnapshotRouter from './routes/platformSnapshot'
import adminMaintenanceRouter from './routes/adminMaintenance'
import tenantSnapshotRouter from './routes/tenantSnapshot'
import { requestLogger } from './middlewares/requestLogger'
import { errorHandler } from './middlewares/errorHandler'
import { priceTransform } from './middlewares/priceTransform'
import { maintenanceGuard } from './middlewares/maintenance'
import { buildAllowedOrigins, isOriginAllowed } from './middlewares/corsOrigin'
import { config } from './config'

export function createApp() {
  const app = express()
  // Echo the request Origin (instead of '*') and allow credentials so that clients which default
  // to `withCredentials: true` — notably Taro H5's `uploadFile` — aren't blocked by the browser's
  // CORS rule forbidding a wildcard ACAO alongside credentials. In production we restrict the
  // echo to the two browser origins configured in .env (H5APP_DOMAIN, WEBADMIN_DOMAIN); in dev
  // any Origin is accepted. Non-browser clients (WeChat miniprogram native, server-to-server)
  // don't send Origin and pass through unaffected. Decision logic lives in ./middlewares/corsOrigin
  // so it can be unit-tested without an HTTP server.
  const allowed = buildAllowedOrigins([config.h5AppDomain, config.webAdminDomain])
  const strict = config.nodeEnv === 'production'
  // Fail-fast at boot rather than silently blocking every browser request. If we don't throw
  // here, /health still returns 200 (no Origin) but admin/H5 UIs see CORS errors only once a
  // human opens DevTools — a config migration miss becomes a runtime incident.
  if (strict && allowed.length === 0) {
    throw new Error(
      'CORS strict mode is on (NODE_ENV=production) but no allowed origins are configured. ' +
        'Set H5APP_DOMAIN and/or WEBADMIN_DOMAIN in .env.'
    )
  }
  app.use(
    cors({
      // Disallowed origins get `false`, which makes the cors package omit ACAO without raising an
      // error. The request still reaches handlers, but the browser blocks the response client-side
      // because ACAO is absent.
      origin: (origin, cb) => cb(null, isOriginAllowed(origin, allowed, strict)),
      credentials: true
    })
  )
  app.use(express.json())
  app.use(priceTransform)
  app.use(requestLogger)
  app.use(maintenanceGuard)

  app.get('/health', (req, res) => {
    res.status(200).send('OK')
  })

  app.use(authRouter)
  app.use(wechatAuthRouter)
  app.use(wechatUserRouter)
  app.use(adminUsersRouter)
  app.use(adminNotificationsRouter)
  app.use(adminMaintenanceRouter)
  app.use(adminScopesRouter)
  app.use(storesRouter)
  app.use(tablesRouter)
  app.use(ordersRouter)
  app.use(categoriesRouter)
  app.use(goodsRouter)
  app.use(sharedSpecGroupsRouter)
  app.use(tenantSyncRouter)
  app.use(tenantStoresRouter)
  app.use(tenantBrandingRouter)
  app.use(tenantUsersRouter)
  app.use(storeUsersRouter)
  app.use(platformBrandingRouter)
  app.use(platformUsersRouter)
  app.use(platformTenantsRouter)
  app.use(platformStoresRouter)
  app.use(platformSnapshotRouter)
  app.use(tenantSnapshotRouter)
  app.use(overviewStoresRouter)
  app.use(filesRouter)
  app.use(dashboardRouter)

  app.use(errorHandler)
  return app
}
