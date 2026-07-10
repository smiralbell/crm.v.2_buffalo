import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(__dirname, '../prisma/ALTER_PROJECT_TASKS_SMART_CARDS.sql'), 'utf8')

const prisma = new PrismaClient()
try {
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement)
  }
  console.log('project_dev_tasks smart cards migration ready')
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
}
await prisma.$disconnect()
