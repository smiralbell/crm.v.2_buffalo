import { describe, expect, it } from 'vitest'
import { writeFile } from 'fs/promises'
import { renderFlowPdf } from './whatsapp'

const OUTPUT = {
  resumen: 'Semana estable: 3 errores nuevos, todos resueltos, y 2 tickets abiertos esperando al cliente.',
  metricas: { errores_total: 12, errores_abiertos: 0, tickets_abiertos: 2, coste_total: 41.5 },
  hallazgos: ['El error de derivación sin teléfono no se ha repetido.', 'Los tickets abiertos son de configuración.'],
  fuentes: ['incidencias', 'tickets', 'MCP'],
}

describe('PDF del flujo', () => {
  it('genera un PDF válido con el estilo Buffalo', async () => {
    const file = await renderFlowPdf(
      { name: 'Resumen semanal', proyecto_id: '00000000-0000-0000-0000-000000000000', whatsapp_title: 'Informe semanal' },
      OUTPUT
    )
    expect(file.buffer.subarray(0, 4).toString()).toBe('%PDF')
    expect(file.filename).toMatch(/^informe-semanal-.*\.pdf$/)
    if (process.env.FLOW_PDF_OUT) await writeFile(process.env.FLOW_PDF_OUT, file.buffer)
  }, 30_000)
})
