import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { config } from './config'
import path from 'path'
import { Store } from './entities/Store'
import { Table } from './entities/Table'
import { Category } from './entities/Category'
import { Good } from './entities/Good'
import { GoodCategory } from './entities/GoodCategory'
import { SpecGroup } from './entities/SpecGroup'
import { SpecOption } from './entities/SpecOption'
import { SKU } from './entities/SKU'
import { Order } from './entities/Order'
import { OrderItem } from './entities/OrderItem'
import { TableCart } from './entities/TableCart'
import { TableCartItem } from './entities/TableCartItem'
import { PaymentTransaction } from './entities/PaymentTransaction'
import { RefundTransaction } from './entities/RefundTransaction'
import { User } from './entities/User'
import { GoodSpecChangeLog } from './entities/GoodSpecChangeLog'
import { Notification } from './entities/Notification'
import { SharedSpecGroup } from './entities/SharedSpecGroup'
import { SharedSpecOption } from './entities/SharedSpecOption'
import { GoodSharedSpecGroup } from './entities/GoodSharedSpecGroup'
import { Tenant } from './entities/Tenant'
import { AdminScope } from './entities/AdminScope'
import { PlatformConfig } from './entities/PlatformConfig'
import { StoreSyncJob } from './entities/StoreSyncJob'
import { StoreSyncChange } from './entities/StoreSyncChange'
import { OrderStatusLog } from './entities/OrderStatusLog'
import { ensureStoreDefaultTenantAndStore } from './bootstrap/ensureStoreDefault'

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.pass,
  database: config.db.name,
  entities: [
    Store,
    Table,
    Category,
    Good,
    GoodCategory,
    SpecGroup,
    SpecOption,
    SKU,
    Order,
    OrderItem,
    TableCart,
    TableCartItem,
    PaymentTransaction,
    RefundTransaction,
    User,
    GoodSpecChangeLog,
    Notification,
    SharedSpecGroup,
    SharedSpecOption,
    GoodSharedSpecGroup,
    Tenant,
    AdminScope,
    PlatformConfig,
    StoreSyncJob,
    StoreSyncChange,
    OrderStatusLog
  ],
  migrations: [path.join(__dirname, 'migrations/*.js')],
  migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true',
  synchronize: process.env.TYPEORM_SYNC !== 'false',
  logging: false
})

const originalInitialize = AppDataSource.initialize.bind(AppDataSource)
AppDataSource.initialize = async () => {
  const ds = await originalInitialize()
  await ensureStoreDefaultTenantAndStore(AppDataSource)
  return ds
}
