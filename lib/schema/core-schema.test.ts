import { describe, expect, it } from 'vitest'
import { CORE_SCHEMA_STATEMENTS } from './core-schema'

describe('esquema automático', () => {
  it('todas las sentencias son idempotentes (se pueden repetir sin error)', () => {
    for (const sql of CORE_SCHEMA_STATEMENTS) {
      expect(sql, sql).toMatch(/IF NOT EXISTS/)
    }
  })

  it('incluye la columna de contexto de persona y sus tablas', () => {
    const all = CORE_SCHEMA_STATEMENTS.join('\n')
    expect(all).toMatch(/ALTER TABLE leads ADD COLUMN IF NOT EXISTS contexto TEXT/)
    expect(all).toMatch(/persona_drive_folders/)
    expect(all).toMatch(/persona_documents/)
  })
})
