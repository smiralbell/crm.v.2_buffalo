import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(root, '../prisma/ALTER_COLDCALL_PROSPECT_EXTRA_FIELDS.sql'), 'utf8')

const prisma = new PrismaClient()
try {
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement)
  }
  console.log('coldcall prospect extra fields ready')
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
}
await prisma.$disconnect()
