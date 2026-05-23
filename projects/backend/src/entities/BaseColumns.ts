import { Column, DeleteDateColumn } from 'typeorm'

export abstract class BaseColumns {
  @Column({ type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date

  @Column({ type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)', onUpdate: 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date

  @DeleteDateColumn({ type: 'datetime', precision: 3, nullable: true })
  deletedAt: Date | null
}
