import { getPool } from '@/lib/db'
import { notify } from './notify'

/**
 * Avisa de los movimientos grandes del banco: un ingreso o un gasto de más de
 * 100 €. Mira los movimientos nuevos cada minuto. Solo cuenta lo que entra por el
 * banco (Enable Banking); los gastos que se apuntan a mano no pasan por aquí.
 */

export const BIG_MOVEMENT_EUR = 100

/** Hasta dónde se mira hacia atrás en cada revisión; el solape se cubre con la clave de cada aviso. */
const OVERLAP_MS = 5 * 60_000

let since: Date | null = null

function eur(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

export async function tickMoneyAlerts(now = new Date()): Promise<number> {
  // Al arrancar no se avisa de lo que ya había: solo de lo que llegue a partir de ahora
  const from = since ?? now
  since = new Date(now.getTime() - OVERLAP_MS)
  const rows = await getPool()
    .query<{ id: string; amount: string; description: string | null; date: string | null }>(
      `SELECT id::text AS id, amount::text AS amount, description, date::text AS date
         FROM bank_transactions
        WHERE created_at > $1 AND ABS(amount) > $2
        ORDER BY created_at ASC
        LIMIT 100`,
      [from, BIG_MOVEMENT_EUR]
    )
    .catch(() => ({ rows: [] as { id: string; amount: string; description: string | null; date: string | null }[] }))

  for (const r of rows.rows) {
    const amount = Number(r.amount)
    if (!Number.isFinite(amount)) continue
    const ingreso = amount > 0
    const concepto = (r.description ?? '').trim().slice(0, 200) || 'sin concepto'
    const subject = ingreso ? `Ingreso de ${eur(amount)}` : `Gasto de ${eur(Math.abs(amount))}`
    await notify({
      event: ingreso ? 'ingreso_grande' : 'gasto_grande',
      subject,
      text: `${subject}\n${concepto}${r.date ? `\nFecha: ${r.date}` : ''}`,
      dedupeKey: `banco:${r.id}`,
    })
  }
  return rows.rows.length
}
