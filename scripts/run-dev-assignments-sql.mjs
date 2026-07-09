import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
try {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS developer_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary TEXT,
      scope_text TEXT,
      deliverables TEXT,
      reference_links TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
      due_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_developer_assignments_user
      ON developer_assignments(user_id, status)
  `
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_developer_assignments_status
      ON developer_assignments(status)
  `
  console.log('developer_assignments table ready')
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
}
await prisma.$disconnect()
