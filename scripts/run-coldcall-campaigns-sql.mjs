import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(root, '../prisma/CREATE_COLDCALL_CAMPAIGNS.sql'), 'utf8')

const prisma = new PrismaClient()
try {
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement)
  }
  console.log('coldcall campaigns schema ready')
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
}
await prisma.$disconnect()
