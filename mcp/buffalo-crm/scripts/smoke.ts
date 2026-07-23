/**
 * Smoke test del MCP Buffalo CRM (sin stdio).
 * Uso: npx tsx mcp/buffalo-crm/scripts/smoke.ts
 */
import { loadEnv, query, serializeRows } from '../src/db'
import { issueConfirmToken, consumeConfirmToken, confirmStep1Response } from '../src/confirm'

async function main() {
  loadEnv()
  if (!process.env.DATABASE_URL) {
    console.error('FAIL: DATABASE_URL missing')
    process.exit(1)
  }

  const tables = await query(`
    SELECT c.relname AS table
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
    ORDER BY 1
    LIMIT 5
  `)
  console.log('OK tables sample:', serializeRows(tables.rows))

  const pending = issueConfirmToken(
    'crm_delete_rows',
    { table: 'smoke', id: 1 },
    { sample: true }
  )
  console.log('OK confirm step1:', confirmStep1Response(pending).confirm_token?.slice(0, 12) + '…')

  const bad = consumeConfirmToken({
    action: 'crm_delete_rows',
    token: pending.token,
    payload: { table: 'smoke', id: 2 },
    confirm: true,
  })
  console.log('OK reject mismatch:', bad)

  const pending2 = issueConfirmToken(
    'crm_delete_rows',
    { table: 'smoke', id: 1 },
    { sample: true }
  )
  const ok = consumeConfirmToken({
    action: 'crm_delete_rows',
    token: pending2.token,
    payload: { table: 'smoke', id: 1 },
    confirm: true,
  })
  console.log('OK consume match:', ok)

  console.log('SMOKE_PASS')
}

main().catch((e) => {
  console.error('SMOKE_FAIL', e)
  process.exit(1)
})
