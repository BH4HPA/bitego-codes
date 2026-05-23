import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('store_sync_changes')
export class StoreSyncChange extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index()
  @Column({ type: 'varchar', length: 32 })
  tenantId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  sourceStoreId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  entityType: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  entityTemplateId: string

  @Column({ type: 'varchar', length: 20 })
  action: string

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'varchar', length: 32, nullable: true })
  changedByUserId: string | null
}
