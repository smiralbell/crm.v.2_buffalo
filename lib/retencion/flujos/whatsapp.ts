import React from 'react'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { pdf } from '@react-pdf/renderer'
import { query } from '@/lib/db'
import { FlowReportPDF } from '@/components/retencion/FlowReportPDF'
import { sendWhatsAppDocument } from '@/lib/whatsapp-agent/evolution-api'
import type { FlujoRow } from '@/lib/retencion/flujos/store'

const logoCache = new Map<string, string | null>()

async function logo(file: string): Promise<string | undefined> {
  if (!logoCache.has(file)) {
    try {
      const buf = await readFile(join(process.cwd(), 'public', 'buffalo-docs', 'assets', file))
      logoCache.set(file, `data:image/png;base64,${buf.toString('base64')}`)
    } catch {
      logoCache.set(file, null)
    }
  }
  return logoCache.get(file) || undefined
}

async function proyectoName(proyectoId: string): Promise<string> {
  try {
    const { rows } = await query<{ name: string }>(`SELECT name FROM proyectos WHERE id = $1::uuid`, [proyectoId])
    return rows[0]?.name || 'Cliente'
  } catch {
    return 'Cliente'
  }
}

function fileSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'informe'
  )
}

/** PDF del resultado de un flujo con el estilo del kit de documentos Buffalo. */
export async function renderFlowPdf(
  flujo: Pick<FlujoRow, 'name' | 'proyecto_id' | 'whatsapp_title'>,
  output: unknown
): Promise<{ buffer: Buffer; filename: string; title: string; proyecto: string }> {
  const proyecto = await proyectoName(flujo.proyecto_id)
  const title = flujo.whatsapp_title?.trim() || flujo.name
  const date = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const doc = React.createElement(FlowReportPDF, {
    title,
    proyectoName: proyecto,
    flujoName: flujo.name,
    date,
    output,
    logoHeader: await logo('logo1-trim.png'),
    logoCover: await logo('logo2-trim.png'),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(doc as any).toBlob()
  return {
    buffer: Buffer.from(await blob.arrayBuffer()),
    filename: `${fileSlug(title)}-${fileSlug(proyecto)}.pdf`,
    title,
    proyecto,
  }
}

function captionFor(title: string, proyecto: string, output: unknown): string {
  const resumen =
    output && typeof output === 'object' && !Array.isArray(output)
      ? (output as Record<string, unknown>).resumen ?? (output as Record<string, unknown>).summary
      : null
  const lines = [`${title} · ${proyecto}`]
  if (typeof resumen === 'string' && resumen.trim()) lines.push('', resumen.trim().slice(0, 600))
  return lines.join('\n')
}

/** Envía el informe en PDF a cada móvil del nodo. Devuelve cuántos han salido y los fallos. */
export async function sendFlowToWhatsapp(
  flujo: Pick<FlujoRow, 'name' | 'proyecto_id' | 'whatsapp_title' | 'whatsapp_to'>,
  output: unknown
): Promise<{ sent: number; errors: string[] }> {
  if (!flujo.whatsapp_to.length) return { sent: 0, errors: ['No hay ningún móvil en el nodo de WhatsApp'] }
  const file = await renderFlowPdf(flujo, output)
  const caption = captionFor(file.title, file.proyecto, output)
  let sent = 0
  const errors: string[] = []
  for (const phone of flujo.whatsapp_to) {
    try {
      await sendWhatsAppDocument(phone, { filename: file.filename, buffer: file.buffer, mime: 'application/pdf', caption })
      sent++
    } catch (e) {
      errors.push(`${phone}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { sent, errors }
}
