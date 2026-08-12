import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(__dirname, '../prisma/history/CREATE_PROJECT_NOTES.sql'), 'utf8')

const prisma = new PrismaClient()
try {
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement)
  }
  console.log('project_notes + project_research migration ready')
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
}
await prisma.$disconnect()
