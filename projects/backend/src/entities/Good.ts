import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('goods')
export class Good extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  goodId: string

  @Column({ type: 'varchar', length: 32 })
  storeId: string

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  templateId: string | null

  @Column({ type: 'varchar', length: 32 })
  categoryId: string

  @Column({ type: 'varchar', length: 32, name: 'default_sku_id', nullable: true, default: null })
  defaultSkuId: string | null

  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string

  @Column({ type: 'longtext', nullable: true })
  detailMarkdown: string | null

  @Column({ type: 'longtext', name: 'image_urls', nullable: true })
  imageUrls: string | null

  @Column({ type: 'int', default: 0 })
  sales: number

  @Column({ type: 'bigint', default: 0 })
  basePrice: string

  @Column({ type: 'varchar', length: 20, default: 'OFF_SHELF' })
  status: string
}
