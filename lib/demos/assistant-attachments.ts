import { randomBytes } from 'crypto'
import { mkdir, writeFile, unlink, readdir } from 'fs/promises'
import path from 'path'
import os from 'os'

export type AssistantAttachmentKind = 'document' | 'image'

export interface AssistantAttachment {
  kind: AssistantAttachmentKind
  filename: string
  mime: string
  /** Ruta absoluta temporal o buffer */
  filePath?: string
  buffer?: Buffer
  caption?: string
  /** URL pública servida por el CRM (si ya se publicó) */
  publicUrl?: string
}

type StoredFile = {
  filePath: string
  mime: string
  filename: string
  expiresAt: number
}

const store = new Map<string, StoredFile>()
const TTL_MS = 30 * 60 * 1000

function tmpDir(): string {
  return path.join(os.tmpdir(), 'buffalo-crm-assistant')
}

export async function publishAssistantFile(input: {
  buffer: Buffer
  filename: string
  mime: string
}): Promise<{ token: string; publicUrl: string }> {
  const token = randomBytes(24).toString('hex')
  const dir = tmpDir()
  await mkdir(dir, { recursive: true })
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = path.join(dir, `${token}-${safeName}`)
  await writeFile(filePath, input.buffer)

  store.set(token, {
    filePath,
    mime: input.mime,
    filename: safeName,
    expiresAt: Date.now() + TTL_MS,
  })

  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.OPENROUTER_HTTP_REFERER ||
    ''
  if (!base) {
    throw new Error(
      'NEXT_PUBLIC_BASE_URL no está configurada: hace falta para enviar documentos por WhatsApp'
    )
  }
  const publicUrl = `${base.replace(/\/$/, '')}/api/demos/assistant-files/${token}`
  return { token, publicUrl }
}

export async function readAssistantFile(token: string): Promise<StoredFile | null> {
  const row = store.get(token)
  if (row) {
    if (Date.now() > row.expiresAt) {
      store.delete(token)
      try {
        await unlink(row.filePath)
      } catch {
        // ignore
      }
      return null
    }
    return row
  }

  // Fallback: mismo proceso, proceso reiniciado — buscar {token}-* en disco
  try {
    const dir = tmpDir()
    const files = await readdir(dir)
    const match = files.find((f) => f.startsWith(`${token}-`))
    if (!match) return null
    const filePath = path.join(dir, match)
    const filename = match.slice(token.length + 1)
    const recovered: StoredFile = {
      filePath,
      mime: 'application/octet-stream',
      filename,
      expiresAt: Date.now() + TTL_MS,
    }
    store.set(token, recovered)
    return recovered
  } catch {
    return null
  }
}

export async function ensureAttachmentPublicUrl(
  att: AssistantAttachment
): Promise<AssistantAttachment> {
  if (att.publicUrl) return att
  const buffer =
    att.buffer ||
    (att.filePath ? await import('fs/promises').then((fs) => fs.readFile(att.filePath!)) : null)
  if (!buffer) throw new Error('Adjunto sin contenido')
  const { publicUrl } = await publishAssistantFile({
    buffer,
    filename: att.filename,
    mime: att.mime,
  })
  return { ...att, publicUrl }
}

/** Contexto mutable por petición: el orquestador lo pasa a las tools */
export type AssistantRequestContext = {
  phone: string
  attachments: AssistantAttachment[]
  actionsLog: string[]
}

export function createAssistantContext(phone: string): AssistantRequestContext {
  return { phone, attachments: [], actionsLog: [] }
}
