import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
try {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS admin_password TEXT'
  )
  console.log('admin_password column ready')
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
}
await prisma.$disconnect()
