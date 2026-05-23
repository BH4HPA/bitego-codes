import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('skus')
export class SKU extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  skuId: string

  @Column({ type: 'varchar', length: 32 })
  goodId: string

  @Column({ type: 'varchar', length: 255 })
  specCombination: string

  @Index()
  @Column({ type: 'varchar', name: 'spec_key', length: 32, nullable: true })
  specKey: string | null

  @Column({ type: 'varchar', name: 'spec_signature', length: 1024, nullable: true })
  specSignature: string | null

  @Column({ type: 'bigint', default: 0 })
  price: string

  @Column({ type: 'int', default: 0 })
  stock: number

  @Column({ type: 'varchar', length: 20, default: 'OFF_SHELF' })
  status: string
}
