import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('table_cart_items')
export class TableCartItem extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  cartItemId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  cartId: string

  @Column({ type: 'varchar', length: 32 })
  skuId: string

  @Column({ type: 'varchar', length: 32 })
  goodId: string

  @Column({ type: 'varchar', length: 100 })
  goodNameSnapshot: string

  @Column({ type: 'varchar', length: 255 })
  specTextSnapshot: string

  @Column({ type: 'bigint', default: 0 })
  unitPriceSnapshot: string

  @Column({ type: 'int' })
  qty: number

  @Column({ type: 'varchar', length: 64, nullable: true })
  priceItemKey: string | null

  @Column({ type: 'text', nullable: true })
  nonStockSelectionsSnapshot: string | null

  @Column({ type: 'text', nullable: true })
  priceItemSnapshot: string | null

  @Column({ type: 'varchar', length: 32, nullable: true })
  addedByUserId: string

  @Column({ type: 'varchar', length: 100, nullable: true })
  addedByNicknameSnapshot: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  addedByAvatarSnapshot: string
}
