import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('stores')
export class Store extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  storeId: string

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  tenantId: string | null

  @Column({ type: 'tinyint', default: 1 })
  isPrimary: number

  @Column({ type: 'varchar', length: 100, nullable: true })
  subName: string | null

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl: string

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string
}
