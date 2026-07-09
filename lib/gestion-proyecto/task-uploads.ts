import { join } from 'path'
import { mkdir } from 'fs/promises'

export const PROJECT_TASK_UPLOAD_DIR = join(process.cwd(), 'uploads', 'project-tasks')

export async function ensureTaskUploadDir(projectId: string, taskId: string) {
  const dir = join(PROJECT_TASK_UPLOAD_DIR, projectId, taskId)
  await mkdir(dir, { recursive: true })
  return dir
}
