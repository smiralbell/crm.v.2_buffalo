import { join } from 'path'
import { mkdir } from 'fs/promises'

export const PROJECT_ONBOARDING_UPLOAD_DIR = join(
  process.cwd(),
  'uploads',
  'project-onboarding'
)

export async function ensureProjectUploadDir(projectId: string) {
  const dir = join(PROJECT_ONBOARDING_UPLOAD_DIR, projectId)
  await mkdir(dir, { recursive: true })
  return dir
}
