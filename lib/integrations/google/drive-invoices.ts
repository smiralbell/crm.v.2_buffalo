import { Readable } from 'stream'
import { query } from '@/lib/db'
import { getAuthorizedDriveClient } from '@/lib/integrations/google/drive-auth'

export type DriveInvoiceTipo = 'gastos' | 'emitidas'

export type UploadInvoiceToDriveInput = {
  tipo: DriveInvoiceTipo
  /** YYYY-MM */
  yearMonth: string
  /** Nombre del archivo en Drive (sin forzar extensión). */
  fileName: string
  buffer: Buffer
  mimeType?: string
}

export type UploadInvoiceToDriveResult = {
  folderId: string
  fileId: string
  fileName: string
  webViewLink?: string | null
  createdFolder: boolean
}

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/

/** Carpeta padre FACTURAS/GASTOS (la del workflow n8n). */
const DEFAULT_PARENT_GASTOS = '1K3e9uuW_VFGy_qr7PEr-Zzars6xvKzEF'

function parentFolderId(tipo: DriveInvoiceTipo): string {
  if (tipo === 'gastos') {
    return (
      process.env.GOOGLE_DRIVE_PARENT_GASTOS?.trim() || DEFAULT_PARENT_GASTOS
    )
  }
  const emitidas = process.env.GOOGLE_DRIVE_PARENT_EMITIDAS?.trim()
  if (!emitidas) {
    throw new Error(
      'GOOGLE_DRIVE_PARENT_EMITIDAS no está configurado (ID de la carpeta FACTURAS/EMITIDAS en Drive)'
    )
  }
  return emitidas
}

function sanitizeFileName(name: string): string {
  const base = (name || 'documento').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180)
  return base || 'documento.pdf'
}

function ensurePdfExtension(name: string, mimeType: string): string {
  if (/\.pdf$/i.test(name)) return name
  if (mimeType === 'application/pdf' || !/\.[a-z0-9]{2,5}$/i.test(name)) {
    return `${name}.pdf`
  }
  return name
}

async function lookupMonthFolder(
  tipo: DriveInvoiceTipo,
  yearMonth: string
): Promise<string | null> {
  const r = await query<{ ruta_id: string }>(
    `SELECT ruta_id FROM drive_carpetas_facturas
      WHERE tipo = $1 AND nombre = $2
      LIMIT 1`,
    [tipo, yearMonth]
  )
  return r.rows[0]?.ruta_id || null
}

async function insertMonthFolder(
  tipo: DriveInvoiceTipo,
  yearMonth: string,
  rutaId: string
): Promise<void> {
  await query(
    `INSERT INTO drive_carpetas_facturas (tipo, nombre, ruta_id, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tipo, nombre) DO NOTHING`,
    [tipo, yearMonth, rutaId]
  )
}

/**
 * Misma lógica que n8n:
 * 1) Buscar carpeta YYYY-MM en drive_carpetas_facturas
 * 2) Si no existe → crear en Drive bajo el padre del tipo e insertar en BD
 * 3) Devolver ruta_id
 */
export async function ensureMonthFolder(
  tipo: DriveInvoiceTipo,
  yearMonth: string
): Promise<{ folderId: string; created: boolean }> {
  if (!YEAR_MONTH_RE.test(yearMonth)) {
    throw new Error(`year_month inválido: ${yearMonth} (esperado YYYY-MM)`)
  }

  const existing = await lookupMonthFolder(tipo, yearMonth)
  if (existing) return { folderId: existing, created: false }

  const drive = await getAuthorizedDriveClient()
  const parentId = parentFolderId(tipo)

  const created = await drive.files.create({
    requestBody: {
      name: yearMonth,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id,name',
    supportsAllDrives: true,
  })

  const folderId = created.data.id
  if (!folderId) throw new Error('Google Drive no devolvió id de carpeta')

  try {
    await insertMonthFolder(tipo, yearMonth, folderId)
  } catch (e) {
    // Carrera: otro proceso insertó; re-leer
    console.warn('[drive-invoices] insert carpeta (posible race):', e)
  }

  const again = await lookupMonthFolder(tipo, yearMonth)
  return { folderId: again || folderId, created: true }
}

/** Sube el PDF a la carpeta del mes (crea la carpeta si hace falta). */
export async function uploadInvoiceToDrive(
  input: UploadInvoiceToDriveInput
): Promise<UploadInvoiceToDriveResult> {
  const tipo = input.tipo
  const yearMonth = input.yearMonth.trim()
  const mimeType = input.mimeType || 'application/pdf'
  const fileName = ensurePdfExtension(sanitizeFileName(input.fileName), mimeType)

  if (!input.buffer?.length) {
    throw new Error('PDF vacío')
  }

  const { folderId, created } = await ensureMonthFolder(tipo, yearMonth)
  const drive = await getAuthorizedDriveClient()

  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(input.buffer),
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  })

  const fileId = uploaded.data.id
  if (!fileId) throw new Error('Google Drive no devolvió id de archivo')

  return {
    folderId,
    fileId,
    fileName: uploaded.data.name || fileName,
    webViewLink: uploaded.data.webViewLink,
    createdFolder: created,
  }
}
