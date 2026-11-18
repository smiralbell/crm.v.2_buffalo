import type { NextApiRequest } from 'next'
import formidable from 'formidable'
import { readFile } from 'fs/promises'
import { prisma } from '@/lib/prisma'
import { MAX_ATTACHMENT_BYTES } from '@/lib/integrations/google/drive-attachments'
import type { ProjectTaskAttachment } from '@/lib/gestion-proyecto/types'

/**
 * Adjuntos de las tareas sueltas (crm_user_tasks). El archivo vive en Google
 * Drive; aquí solo se guarda su id y los datos para listarlo.
 */

export type UploadedFile = { name: string; mime: string; buffer: Buffer }

/** Lee los archivos de un formulario multipart (campo «file» o «files»). */
export function readUploadedFiles(req: NextApiRequest): Promise<UploadedFile[]> {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, maxFileSize: MAX_ATTACHMENT_BYTES })
    form.parse(req, async (err, _fields, files) => {
      if (err) {
        const tooBig = /maxFileSize|exceeded/i.test(String(err.message || err))
        reject(new Error(tooBig ? 'Cada archivo puede ocupar como mucho 25 MB' : 'No se pudo leer el archivo'))
        return
      }
      try {
        const raw = files.file || files.files
        const list = Array.isArray(raw) ? raw : raw ? [raw] : []
        const out: UploadedFile[] = []
        for (const f of list) {
          if (!f?.filepath) continue
          out.push({
            name: (f.originalFilename || 'archivo').trim() || 'archivo',
            mime: f.mimetype || 'application/octet-stream',
            buffer: await readFile(f.filepath),
          })
        }
        resolve(out)
      } catch (e) {
        reject(e)
      }
    })
  })
}

let tableReady = false

export async function ensurePersonalAttachmentsTable(): Promise<void> {
  if (tableReady) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS crm_user_task_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES crm_user_tasks(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      drive_file_id TEXT NOT NULL,
      uploaded_by_id INTEGER,
      uploaded_by_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS crm_user_task_attachments_task ON crm_user_task_attachments (task_id)`
  )
  tableReady = true
}

type Row = {
  id: string
  task_id: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  drive_file_id: string
  created_at: Date
}

function toPublic(r: Row): ProjectTaskAttachment {
  return {
    id: r.id,
    task_id: r.task_id,
    file_name: r.file_name,
    mime_type: r.mime_type,
    file_size: r.file_size == null ? null : Number(r.file_size),
    created_at: r.created_at.toISOString(),
  }
}

/** Adjuntos de varias tareas sueltas, por tarea. */
export async function listPersonalAttachments(taskIds: string[]): Promise<Map<string, ProjectTaskAttachment[]>> {
  const map = new Map<string, ProjectTaskAttachment[]>()
  if (!taskIds.length) return map
  await ensurePersonalAttachmentsTable()
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id::text AS id, task_id::text AS task_id, file_name, mime_type, file_size, drive_file_id, created_at
      FROM crm_user_task_attachments
     WHERE task_id = ANY(${taskIds}::uuid[])
     ORDER BY created_at ASC
  `
  for (const r of rows) map.set(r.task_id, [...(map.get(r.task_id) ?? []), toPublic(r)])
  return map
}

export async function addPersonalAttachment(input: {
  taskId: string
  fileName: string
  mimeType: string
  fileSize: number
  driveFileId: string
  uploadedBy: { id: number; name: string }
}): Promise<ProjectTaskAttachment> {
  await ensurePersonalAttachmentsTable()
  const rows = await prisma.$queryRaw<Row[]>`
    INSERT INTO crm_user_task_attachments (task_id, file_name, mime_type, file_size, drive_file_id, uploaded_by_id, uploaded_by_name)
    VALUES (${input.taskId}::uuid, ${input.fileName}, ${input.mimeType}, ${input.fileSize}, ${input.driveFileId},
            ${input.uploadedBy.id > 0 ? input.uploadedBy.id : null}, ${input.uploadedBy.name})
    RETURNING id::text AS id, task_id::text AS task_id, file_name, mime_type, file_size, drive_file_id, created_at
  `
  return toPublic(rows[0])
}

export async function getPersonalAttachment(
  taskId: string,
  attachmentId: string
): Promise<(ProjectTaskAttachment & { drive_file_id: string }) | null> {
  await ensurePersonalAttachmentsTable()
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id::text AS id, task_id::text AS task_id, file_name, mime_type, file_size, drive_file_id, created_at
      FROM crm_user_task_attachments
     WHERE id = ${attachmentId}::uuid AND task_id = ${taskId}::uuid
     LIMIT 1
  `
  return rows[0] ? { ...toPublic(rows[0]), drive_file_id: rows[0].drive_file_id } : null
}

export async function deletePersonalAttachmentRow(attachmentId: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM crm_user_task_attachments WHERE id = ${attachmentId}::uuid`
}

/** Ids de Drive de todos los adjuntos de una tarea (para mandarlos a la papelera al borrarla). */
export async function personalAttachmentDriveIds(taskId: string): Promise<string[]> {
  await ensurePersonalAttachmentsTable()
  const rows = await prisma.$queryRaw<{ drive_file_id: string }[]>`
    SELECT drive_file_id FROM crm_user_task_attachments WHERE task_id = ${taskId}::uuid
  `
  return rows.map((r) => r.drive_file_id)
}

/** Para servir el archivo con su nombre (también con tildes y espacios). */
export function contentDisposition(fileName: string, inline: boolean): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
