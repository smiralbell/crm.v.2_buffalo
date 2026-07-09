import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export type CrmRole = 'admin' | 'developer'

export interface CrmUserRow {
  id: number
  name: string
  email: string
  role: CrmRole
  active: boolean
  created_at: Date
  updated_at: Date
}

export interface CrmUserPublic {
  id: number
  name: string
  email: string
  role: CrmRole
  active: boolean
  created_at: string
  updated_at: string
}

function toPublic(row: CrmUserRow): CrmUserPublic {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}

export async function findCrmUserByEmail(email: string): Promise<
  (CrmUserRow & { password_hash: string }) | null
> {
  try {
    const rows = await prisma.$queryRaw<
      (CrmUserRow & { password_hash: string })[]
    >`
      SELECT id, name, email, password_hash, role, active, created_at, updated_at
      FROM crm_users
      WHERE LOWER(email) = LOWER(${email}) AND active = TRUE
      LIMIT 1
    `
    return rows[0] ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('crm_users') || msg.includes('does not exist')) return null
    throw err
  }
}

export async function findCrmUserById(id: number): Promise<CrmUserRow | null> {
  try {
    const rows = await prisma.$queryRaw<CrmUserRow[]>`
      SELECT id, name, email, role, active, created_at, updated_at
      FROM crm_users WHERE id = ${id} LIMIT 1
    `
    return rows[0] ?? null
  } catch {
    return null
  }
}

export async function listCrmUsers(): Promise<CrmUserPublic[]> {
  const rows = await prisma.$queryRaw<CrmUserRow[]>`
    SELECT id, name, email, role, active, created_at, updated_at
    FROM crm_users
    ORDER BY created_at DESC
  `
  return rows.map(toPublic)
}

export async function createCrmUser(input: {
  name: string
  email: string
  password: string
  role?: CrmRole
}): Promise<CrmUserPublic> {
  const hash = await bcrypt.hash(input.password, 12)
  const plainPassword = input.password
  try {
    const rows = await prisma.$queryRaw<CrmUserRow[]>`
      INSERT INTO crm_users (name, email, password_hash, role, admin_password)
      VALUES (
        ${input.name.trim()},
        ${input.email.trim().toLowerCase()},
        ${hash},
        ${input.role || 'developer'},
        ${plainPassword}
      )
      RETURNING id, name, email, role, active, created_at, updated_at
    `
    return toPublic(rows[0])
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (!msg.includes('admin_password')) throw err
    const rows = await prisma.$queryRaw<CrmUserRow[]>`
      INSERT INTO crm_users (name, email, password_hash, role)
      VALUES (
        ${input.name.trim()},
        ${input.email.trim().toLowerCase()},
        ${hash},
        ${input.role || 'developer'}
      )
      RETURNING id, name, email, role, active, created_at, updated_at
    `
    return toPublic(rows[0])
  }
}

export async function updateCrmUserPassword(
  id: number,
  password: string
): Promise<CrmUserPublic | null> {
  const hash = await bcrypt.hash(password, 12)
  try {
    const rows = await prisma.$queryRaw<CrmUserRow[]>`
      UPDATE crm_users
      SET password_hash = ${hash},
          admin_password = ${password},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, email, role, active, created_at, updated_at
    `
    return rows[0] ? toPublic(rows[0]) : null
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (!msg.includes('admin_password')) throw err
    const rows = await prisma.$queryRaw<CrmUserRow[]>`
      UPDATE crm_users
      SET password_hash = ${hash}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, email, role, active, created_at, updated_at
    `
    return rows[0] ? toPublic(rows[0]) : null
  }
}

export async function getCrmUserAdminPassword(id: number): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ admin_password: string | null }[]>`
      SELECT admin_password FROM crm_users WHERE id = ${id} LIMIT 1
    `
    return rows[0]?.admin_password ?? null
  } catch {
    return null
  }
}

export async function setCrmUserActive(id: number, active: boolean): Promise<CrmUserPublic | null> {
  const rows = await prisma.$queryRaw<CrmUserRow[]>`
    UPDATE crm_users SET active = ${active}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, name, email, role, active, created_at, updated_at
  `
  return rows[0] ? toPublic(rows[0]) : null
}

export async function verifyCrmUserPassword(
  email: string,
  password: string
): Promise<CrmUserRow | null> {
  const row = await findCrmUserByEmail(email)
  if (!row) return null
  const ok = await bcrypt.compare(password, row.password_hash)
  if (!ok) return null
  const { password_hash: _, ...user } = row
  return user
}

export async function listDeveloperUsers(): Promise<CrmUserPublic[]> {
  const rows = await prisma.$queryRaw<CrmUserRow[]>`
    SELECT id, name, email, role, active, created_at, updated_at
    FROM crm_users
    WHERE role = 'developer' AND active = TRUE
    ORDER BY name ASC
  `
  return rows.map(toPublic)
}
