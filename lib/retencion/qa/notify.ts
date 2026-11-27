import { renderFlowPdf } from '@/lib/retencion/flujos/whatsapp'
import { sendWhatsAppDocument, sendWhatsAppText } from '@/lib/whatsapp-agent/evolution-api'
import type { WhatsappConfig } from './types'

/**
 * Nodo final «Enviar por WhatsApp» de los flujos de calidad. Usa el mismo número
 * (Evolution API) y el mismo PDF con estilo Buffalo que los flujos de Sistema.
 */

export type SendResult = { sent: number; errors: string[] }

export async function sendQaText(cfg: WhatsappConfig, text: string): Promise<SendResult> {
  if (!cfg.enabled || !cfg.to.length) return { sent: 0, errors: [] }
  let sent = 0
  const errors: string[] = []
  for (const phone of cfg.to) {
    try {
      await sendWhatsAppText(phone, text)
      sent++
    } catch (e) {
      errors.push(`${phone}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { sent, errors }
}

/** Informe en PDF a cada móvil, con un resumen en el texto del mensaje. */
export async function sendQaPdf(
  cfg: WhatsappConfig,
  proyectoId: string,
  title: string,
  pdfOutput: Record<string, unknown>,
  caption: string
): Promise<SendResult> {
  if (!cfg.enabled || !cfg.to.length) return { sent: 0, errors: [] }
  const file = await renderFlowPdf({ name: title, proyecto_id: proyectoId, whatsapp_title: title }, pdfOutput)
  let sent = 0
  const errors: string[] = []
  for (const phone of cfg.to) {
    try {
      await sendWhatsAppDocument(phone, { filename: file.filename, buffer: file.buffer, mime: 'application/pdf', caption: `${title} · ${file.proyecto}\n\n${caption}`.slice(0, 1000) })
      sent++
    } catch (e) {
      errors.push(`${phone}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { sent, errors }
}
