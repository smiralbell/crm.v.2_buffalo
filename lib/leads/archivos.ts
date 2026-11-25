import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { Readable } from 'stream'
import { getAuthorizedDriveClient } from '@/lib/integrations/google/drive-auth'
import { ensureChildFolder, safeDriveName, MAX_ATTACHMENT_BYTES } from '@/lib/integrations/google/drive-attachments'
import { pickClientFolder, type FolderRow } from '@/lib/leads/drive-match'

/**
 * Archivos de una persona (onboarding): carpeta del cliente en Google Drive,
 * documentos y propuestas subidos, y facturas vinculadas.
 *
 * Nada se sube a Drive hasta que se sube un documento o se vincula una factura.
 * La carpeta del cliente se busca dentro de GOOGLE_DRIVE_CLIENTES_FOLDER_ID por
 * nombre (empresa o persona). Si no existe, se crea. Queda guardada en BD.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

export const PERSONA_TIPOS = ['documento', 'propuesta'] as const
export type PersonaTipo = (typeof PERSONA_TIPOS)[number]

const TIPO_FOLDER: Record<PersonaTipo | 'factura', string> = {
  documento: 'Documentación',
  propuesta: 'Propuestas',
  factura: 'Facturas',
}

export function clientsRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_CLIENTES_FOLDER_ID?.trim() || null
}

export function isPersonaDriveConfigured(): boolean {
  return Boolean(
    clientsRootFolderId() && (process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN)
  )
}

let tablesReady = false
async function ensureTables(): Promise<void> {
  if (tablesReady) return
  await query(`
    CREATE TABLE IF NOT EXISTS persona_drive_folders (
      lead_id INTEGER PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
      folder_id TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      matched_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
  await query(`
    CREATE TABLE IF NOT EXISTS persona_documents (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      file_name TEXT NOT NULL,
      drive_file_id TEXT NOT NULL,
      web_link TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
  tablesReady = true
}

export type PersonaFolderInfo = {
  folder_id: string
  folder_name: string
  folder_url: string
  matched_by: string
}

function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`
}

/** Carpeta del cliente ya guardada, sin tocar Drive. */
export async function savedFolder(leadId: number): Promise<PersonaFolderInfo | null> {
  await ensureTables()
  const rows = await query<{ folder_id: string; folder_name: string; matched_by: string }>(
    `SELECT folder_id, folder_name, matched_by FROM persona_drive_folders WHERE lead_id = $1`,
    [leadId]
  )
  const r = rows.rows[0]
  return r ? { ...r, folder_url: folderUrl(r.folder_id) } : null
}

/** Busca o crea la carpeta del cliente. Solo se llama al subir algo o al vincular una factura. */
export async function ensureClientFolder(leadId: number): Promise<PersonaFolderInfo> {
  const existing = await savedFolder(leadId)
  if (existing) return existing

  const root = clientsRootFolderId()
  if (!root) throw new Error('Falta GOOGLE_DRIVE_CLIENTES_FOLDER_ID: no hay carpeta de clientes en Drive')

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { contact: { select: { nombre: true, empresa: true } } },
  })
  if (!lead) throw new Error('Persona no encontrada')
  const clientName = (lead.contact.empresa || lead.contact.nombre || '').trim()
  if (!clientName) throw new Error('La persona no tiene nombre ni empresa: no se puede crear su carpeta')

  const drive = await getAuthorizedDriveClient()
  const listed = await drive.files.list({
    q: `'${root}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const folders = (listed.data.files || []).filter((f): f is FolderRow => Boolean(f.id && f.name))

  const picked = pickClientFolder(clientName, folders)
  let folder = picked.folder
  if (!folder) {
    const id = await ensureChildFolder(root, safeDriveName(clientName, 'Cliente'))
    folder = { id, name: safeDriveName(clientName, 'Cliente') }
  }

  await ensureTables()
  await query(
    `INSERT INTO persona_drive_folders (lead_id, folder_id, folder_name, matched_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (lead_id) DO NOTHING`,
    [leadId, folder.id, folder.name, picked.matchedBy]
  )
  return { folder_id: folder.id, folder_name: folder.name, folder_url: folderUrl(folder.id), matched_by: picked.matchedBy }
}

export type PersonaDocumento = {
  id: number
  tipo: string
  file_name: string
  web_link: string | null
  created_at: string
}

export async function listPersonaDocumentos(leadId: number): Promise<PersonaDocumento[]> {
  await ensureTables()
  const rows = await query<{ id: number; tipo: string; file_name: string; web_link: string | null; created_at: Date }>(
    `SELECT id, tipo, file_name, web_link, created_at FROM persona_documents
     WHERE lead_id = $1 ORDER BY created_at DESC`,
    [leadId]
  )
  return rows.rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }))
}

export async function uploadPersonaDocumento(input: {
  leadId: number
  tipo: PersonaTipo
  fileName: string
  mime: string
  buffer: Buffer
}): Promise<PersonaDocumento> {
  if (!isPersonaDriveConfigured()) {
    throw new Error('Drive no está configurado (GOOGLE_DRIVE_CLIENTES_FOLDER_ID)')
  }
  if (!input.buffer.length) throw new Error('El archivo está vacío')
  if (input.buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('El archivo pasa de 25 MB')

  const client = await ensureClientFolder(input.leadId)
  const sub = await ensureChildFolder(client.folder_id, TIPO_FOLDER[input.tipo])
  const drive = await getAuthorizedDriveClient()
  const name = safeDriveName(input.fileName)
  const uploaded = await drive.files.create({
    requestBody: { name, parents: [sub] },
    media: { mimeType: input.mime || 'application/octet-stream', body: Readable.from(input.buffer) },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  })
  const fileId = uploaded.data.id
  if (!fileId) throw new Error('Google Drive no devolvió el id del archivo')

  await ensureTables()
  const inserted = await query<{ id: number; created_at: Date }>(
    `INSERT INTO persona_documents (lead_id, tipo, file_name, drive_file_id, web_link)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [input.leadId, input.tipo, name, fileId, uploaded.data.webViewLink || null]
  )
  const row = inserted.rows[0]
  return {
    id: row.id,
    tipo: input.tipo,
    file_name: name,
    web_link: uploaded.data.webViewLink || null,
    created_at: new Date(row.created_at).toISOString(),
  }
}

/**
 * Crea un acceso directo a la factura en la carpeta «Facturas» del cliente.
 * No mueve ni copia el PDF: la contabilidad mensual sigue igual.
 */
export async function addInvoiceShortcut(input: {
  leadId: number
  invoiceNumber: string
  pdfDriveFileId: string
}): Promise<void> {
  const client = await ensureClientFolder(input.leadId)
  const facturas = await ensureChildFolder(client.folder_id, TIPO_FOLDER.factura)
  const drive = await getAuthorizedDriveClient()
  const name = safeDriveName(input.invoiceNumber, 'Factura')

  const existing = await drive.files.list({
    q: `'${facturas}' in parents and name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  if (existing.data.files?.[0]?.id) return

  await drive.files.create({
    requestBody: {
      name,
      mimeType: SHORTCUT_MIME,
      parents: [facturas],
      shortcutDetails: { targetId: input.pdfDriveFileId },
    },
    fields: 'id',
    supportsAllDrives: true,
  })
}
