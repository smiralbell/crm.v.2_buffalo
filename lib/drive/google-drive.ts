import { Readable } from 'stream'
import { google } from 'googleapis'
import { query } from '@/lib/db'

export type DriveInvoiceKind = 'gastos' | 'emitidas'

const DRIVE_FOLDERS_TABLE_HINT =
  'Ejecuta en PostgreSQL: prisma/CREATE_DRIVE_CARPETAS_FACTURAS.sql (y prisma/ALTER_EXPENSES_DRIVE_COLUMNS.sql para gastos).'

function rethrowDriveDbError(error: unknown): never {
  const msg = error instanceof Error ? error.message : String(error)
  if (msg.includes('drive_carpetas_facturas') && msg.includes('does not exist')) {
    throw new Error(`La tabla drive_carpetas_facturas no existe. ${DRIVE_FOLDERS_TABLE_HINT}`)
  }
  throw error instanceof Error ? error : new Error(msg)
}

type DriveFileResult = {
  id: string
  url: string | null
  folderId: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`)
  }
  return value
}

function getDriveParentFolderId(kind: DriveInvoiceKind): string {
  return kind === 'gastos'
    ? requiredEnv('GOOGLE_DRIVE_FOLDER_GASTOS_ID')
    : requiredEnv('GOOGLE_DRIVE_FOLDER_EMITIDAS_ID')
}

function getDriveClient() {
  const clientEmail = requiredEnv('GOOGLE_DRIVE_CLIENT_EMAIL')
  const privateKey = requiredEnv('GOOGLE_DRIVE_PRIVATE_KEY').replace(/\\n/g, '\n')

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  return google.drive({ version: 'v3', auth })
}

async function folderStillExists(folderId: string): Promise<boolean> {
  const drive = getDriveClient()
  try {
    await drive.files.get({
      fileId: folderId,
      fields: 'id',
      supportsAllDrives: true,
    })
    return true
  } catch (error: any) {
    if (error?.code === 404) return false
    throw error
  }
}

async function createMonthFolder(kind: DriveInvoiceKind, yearMonth: string): Promise<string> {
  const drive = getDriveClient()
  const parentId = getDriveParentFolderId(kind)

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
  if (!folderId) {
    throw new Error(`No se pudo crear la carpeta mensual ${yearMonth} en Google Drive`)
  }

  try {
    await query(
      `INSERT INTO drive_carpetas_facturas (tipo, nombre, ruta_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tipo, nombre)
       DO UPDATE SET ruta_id = EXCLUDED.ruta_id`,
      [kind, yearMonth, folderId]
    )
  } catch (error) {
    rethrowDriveDbError(error)
  }

  return folderId
}

export async function ensureInvoiceMonthFolder(
  kind: DriveInvoiceKind,
  yearMonth: string
): Promise<string> {
  let existing: { rows: { ruta_id: string }[] }
  try {
    existing = await query<{ ruta_id: string }>(
      `SELECT ruta_id
         FROM drive_carpetas_facturas
        WHERE tipo = $1 AND nombre = $2
        LIMIT 1`,
      [kind, yearMonth]
    )
  } catch (error) {
    rethrowDriveDbError(error)
  }

  const cachedFolderId = existing.rows[0]?.ruta_id
  if (cachedFolderId) {
    const exists = await folderStillExists(cachedFolderId)
    if (exists) return cachedFolderId
  }

  return createMonthFolder(kind, yearMonth)
}

function normalizePdfName(fileName: string): string {
  const trimmed = fileName.trim()
  if (!trimmed) return 'documento.pdf'
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`
}

export async function uploadPdfToDrive(params: {
  kind: DriveInvoiceKind
  yearMonth: string
  fileName: string
  buffer: Buffer
  mimeType?: string
}): Promise<DriveFileResult> {
  const drive = getDriveClient()
  const folderId = await ensureInvoiceMonthFolder(params.kind, params.yearMonth)

  const created = await drive.files.create({
    requestBody: {
      name: normalizePdfName(params.fileName),
      parents: [folderId],
    },
    media: {
      mimeType: params.mimeType || 'application/pdf',
      body: Readable.from(params.buffer),
    },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  })

  const fileId = created.data.id
  if (!fileId) {
    throw new Error('Google Drive no devolvió el ID del archivo subido')
  }

  return {
    id: fileId,
    url: created.data.webViewLink || null,
    folderId,
  }
}

export async function deleteDriveFile(
  fileId: string
): Promise<{ deleted: boolean; missing: boolean }> {
  const drive = getDriveClient()
  try {
    await drive.files.delete({
      fileId,
      supportsAllDrives: true,
    })
    return { deleted: true, missing: false }
  } catch (error: any) {
    if (error?.code === 404) {
      return { deleted: false, missing: true }
    }
    throw error
  }
}
