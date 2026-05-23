import { AppDataSource } from './db'

async function run() {
  await AppDataSource.initialize()
  await AppDataSource.runMigrations()
  await AppDataSource.destroy()
}

run()
