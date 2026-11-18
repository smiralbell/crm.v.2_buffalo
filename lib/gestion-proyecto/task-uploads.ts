import { join } from 'path'
import { mkdir } from 'fs/promises'
import { prisma } from '@/lib/prisma'

/** Adjuntos antiguos (en el disco del servidor). Los nuevos van a Google Drive. */
export const PROJECT_TASK_UPLOAD_DIR = join(process.cwd(), 'uploads', 'project-tasks')

export async function ensureTaskUploadDir(projectId: string, taskId: string) {
  const dir = join(PROJECT_TASK_UPLOAD_DIR, projectId, taskId)
  await mkdir(dir, { recursive: true })
  return dir
}

let driveColumnReady = false

/** Columna con el id del archivo en Drive (los adjuntos en disco la tienen vacía). */
export async function ensureProjectAttachmentDriveColumn(): Promise<void> {
  if (driveColumnReady) return
  await prisma.$executeRawUnsafe(
    `ALTER TABLE project_dev_task_attachments ADD COLUMN IF NOT EXISTS drive_file_id TEXT`
  )
  driveColumnReady = true
}
