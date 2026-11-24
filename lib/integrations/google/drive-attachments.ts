import { Readable } from 'stream'
import { getAuthorizedDriveClient } from './drive-auth'

/**
 * Adjuntos del CRM (tareas, y lo que venga) en una carpeta de Google Drive.
 *
 *   GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID   id de la carpeta raíz (la parte final de su URL)
 *
 * Usa la misma cuenta de Drive que las facturas (GOOGLE_DRIVE_REFRESH_TOKEN).
 * Los archivos no se hacen públicos: el CRM los sirve solo a quien tiene acceso.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

export function attachmentsRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID?.trim() || null
}

export function isDriveAttachmentsConfigured(): boolean {
  return Boolean(
    attachmentsRootFolderId() && (process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN)
  )
}

/** Nombre válido para Drive y legible: sin barras ni caracteres de control. */
export function safeDriveName(name: string, fallback = 'archivo'): string {
  const clean = name
    .replace(/[\\/]+/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  return clean || fallback
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Carpetas ya encontradas o creadas en este proceso: «padre/nombre» → id */
const folderCache = new Map<string, string>()

export async function ensureChildFolder(parentId: string, name: string): Promise<string> {
  const key = `${parentId}/${name}`
  const cached = folderCache.get(key)
  if (cached) return cached

  const drive = await getAuthorizedDriveClient()
  const found = await drive.files.list({
    q: `'${escapeQuery(parentId)}' in parents and name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  let id = found.data.files?.[0]?.id || null
  if (!id) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: 'id',
      supportsAllDrives: true,
    })
    id = created.data.id || null
  }
  if (!id) throw new Error(`Google Drive no devolvió la carpeta «${name}»`)
  folderCache.set(key, id)
  return id
}

/** Sube un archivo a raíz/ruta[0]/ruta[1]/… (crea las carpetas que falten). */
export async function uploadAttachmentToDrive(input: {
  path: string[]
  fileName: string
  mimeType: string
  buffer: Buffer
}): Promise<{ fileId: string; webViewLink: string | null }> {
  const root = attachmentsRootFolderId()
  if (!root) throw new Error('Falta GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID: no hay carpeta de Drive para los adjuntos')
  if (!input.buffer.length) throw new Error('El archivo está vacío')
  if (input.buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('El archivo pasa de 25 MB')

  let parent = root
  for (const part of input.path) parent = await ensureChildFolder(parent, safeDriveName(part, 'Sin nombre'))

  const drive = await getAuthorizedDriveClient()
  const uploaded = await drive.files.create({
    requestBody: { name: safeDriveName(input.fileName), parents: [parent] },
    media: { mimeType: input.mimeType || 'application/octet-stream', body: Readable.from(input.buffer) },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  })
  const fileId = uploaded.data.id
  if (!fileId) throw new Error('Google Drive no devolvió el id del archivo')
  return { fileId, webViewLink: uploaded.data.webViewLink || null }
}

export async function downloadAttachmentFromDrive(fileId: string): Promise<Buffer> {
  const drive = await getAuthorizedDriveClient()
  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
  return Buffer.from(res.data as ArrayBuffer)
}

/** A la papelera de Drive (se puede recuperar desde Drive durante 30 días). */
export async function trashAttachmentInDrive(fileId: string): Promise<void> {
  const drive = await getAuthorizedDriveClient()
  try {
    await drive.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true })
  } catch (err) {
    const e = err as { code?: number; response?: { status?: number } }
    if ((e.code ?? e.response?.status) !== 404) throw err
  }
}
