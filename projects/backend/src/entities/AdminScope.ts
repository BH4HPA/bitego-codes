import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('admin_scopes')
export class AdminScope extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  scopeId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  userId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  tenantId: string

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  storeId: string | null

  @Index()
  @Column({ type: 'varchar', length: 20 })
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN'

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string
}
