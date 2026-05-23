import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('platform_configs')
export class PlatformConfig extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  configId: string

  @Column({ type: 'varchar', length: 100, default: 'BiteGo 点点餐' })
  platformName: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  platformLogoUrl: string | null
}
