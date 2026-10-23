import { prisma } from '@/lib/prisma'
import { ANNUAL_TARGET } from './chart-theme'

let schemaEnsured = false

export async function ensureAnnualTargetColumn(): Promise<void> {
  if (schemaEnsured) return
  await prisma.$executeRawUnsafe(`
    ALTER TABLE financial_settings
    ADD COLUMN IF NOT EXISTS annual_revenue_target NUMERIC(12, 2) NOT NULL DEFAULT 65000
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE financial_settings
    ADD COLUMN IF NOT EXISTS annual_goal_alert_key TEXT
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE financial_settings
    ALTER COLUMN updated_at SET DEFAULT NOW()
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO financial_settings (id, corporate_tax_percent, annual_revenue_target, updated_at)
    VALUES (1, 25, 65000, NOW())
    ON CONFLICT (id) DO NOTHING
  `)
  schemaEnsured = true
}

export async function getAnnualRevenueTarget(): Promise<number> {
  try {
    await ensureAnnualTargetColumn()
    const rows = await prisma.$queryRawUnsafe<{ annual_revenue_target: unknown }[]>(
      `SELECT annual_revenue_target FROM financial_settings WHERE id = 1 LIMIT 1`
    )
    const n = Number(rows[0]?.annual_revenue_target)
    return Number.isFinite(n) && n > 0 ? n : ANNUAL_TARGET
  } catch {
    return ANNUAL_TARGET
  }
}

export async function setAnnualRevenueTarget(value: number): Promise<number> {
  await ensureAnnualTargetColumn()
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n < 1_000 || n > 10_000_000) {
    throw new Error('El objetivo anual debe estar entre 1.000 € y 10.000.000 €')
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO financial_settings (id, corporate_tax_percent, annual_revenue_target, updated_at)
     VALUES (1, 25, $1, NOW())
     ON CONFLICT (id) DO UPDATE
     SET annual_revenue_target = EXCLUDED.annual_revenue_target,
         updated_at = NOW()`,
    n
  )
  const { scheduleAnnualGoalCheck } = await import('./annual-target-alert')
  scheduleAnnualGoalCheck({ target: n })
  return n
}
