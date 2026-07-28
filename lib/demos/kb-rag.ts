import { createHash } from 'crypto'
import { query } from '@/lib/db'
import { openRouterEmbedTexts } from '@/lib/openrouter'

const EMBEDDING_MODEL =
  process.env.DEMO_EMBEDDING_MODEL || 'openai/text-embedding-3-small'

/** Chars target per chunk (approx). */
const CHUNK_SIZE = 900
const CHUNK_OVERLAP = 120
/** Below this, chat can inject full KB instead of forcing tool RAG. */
export const DEMO_KB_FULL_INJECT_MAX_CHARS = 3500

let ensured = false

export async function ensureDemoKbTables(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS demo_kb_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      demo_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (demo_id, chunk_index)
    )
  `)
  await query(
    `CREATE INDEX IF NOT EXISTS idx_demo_kb_chunks_demo_id ON demo_kb_chunks (demo_id)`
  )
  await query(`
    CREATE TABLE IF NOT EXISTS demo_kb_meta (
      demo_id INTEGER PRIMARY KEY REFERENCES demos(id) ON DELETE CASCADE,
      source_hash TEXT NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      embedding_model TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  ensured = true
}

export function hashKnowledgeSource(text: string): string {
  return createHash('sha256').update(text.trim(), 'utf8').digest('hex')
}

/** Split long knowledge text into overlapping chunks. */
export function chunkKnowledgeText(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []

  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const pieces: string[] = []
  let buf = ''

  const flush = () => {
    if (buf.trim()) pieces.push(buf.trim())
    buf = ''
  }

  for (const p of paragraphs) {
    if (p.length > CHUNK_SIZE) {
      flush()
      for (let i = 0; i < p.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        const slice = p.slice(i, i + CHUNK_SIZE).trim()
        if (slice) pieces.push(slice)
      }
      continue
    }
    if (!buf) {
      buf = p
      continue
    }
    if (buf.length + 2 + p.length <= CHUNK_SIZE) {
      buf = `${buf}\n\n${p}`
    } else {
      flush()
      buf = p
    }
  }
  flush()

  return pieces.length > 0 ? pieces : [cleaned.slice(0, CHUNK_SIZE)]
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return -1
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return -1
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function parseEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((n) => Number(n))
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map((n) => Number(n))
    } catch {
      /* ignore */
    }
  }
  return []
}

export async function getDemoKbMeta(demoId: number): Promise<{
  source_hash: string
  chunk_count: number
  embedding_model: string
} | null> {
  await ensureDemoKbTables()
  const { rows } = await query<{
    source_hash: string
    chunk_count: number
    embedding_model: string
  }>(
    `SELECT source_hash, chunk_count, embedding_model FROM demo_kb_meta WHERE demo_id = $1`,
    [demoId]
  )
  return rows[0] ?? null
}

export async function countDemoKbChunks(demoId: number): Promise<number> {
  await ensureDemoKbTables()
  const { rows } = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM demo_kb_chunks WHERE demo_id = $1`,
    [demoId]
  )
  return Number(rows[0]?.c || 0)
}

/**
 * Index (or re-index) a demo knowledge base.
 * Skips if source hash + model unchanged.
 */
export async function indexDemoKnowledgeBase(
  demoId: number,
  knowledgeText: string
): Promise<{ chunks: number; skipped: boolean }> {
  await ensureDemoKbTables()
  const text = knowledgeText.trim()
  const hash = hashKnowledgeSource(text)
  const meta = await getDemoKbMeta(demoId)

  if (!text) {
    await query(`DELETE FROM demo_kb_chunks WHERE demo_id = $1`, [demoId])
    await query(`DELETE FROM demo_kb_meta WHERE demo_id = $1`, [demoId])
    return { chunks: 0, skipped: false }
  }

  if (
    meta &&
    meta.source_hash === hash &&
    meta.embedding_model === EMBEDDING_MODEL &&
    meta.chunk_count > 0
  ) {
    return { chunks: meta.chunk_count, skipped: true }
  }

  const chunks = chunkKnowledgeText(text)
  const embeddings = await openRouterEmbedTexts(chunks, { model: EMBEDDING_MODEL })

  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Embeddings incompletos: ${embeddings.length}/${chunks.length} chunks`
    )
  }

  await query(`DELETE FROM demo_kb_chunks WHERE demo_id = $1`, [demoId])

  for (let i = 0; i < chunks.length; i++) {
    await query(
      `INSERT INTO demo_kb_chunks (demo_id, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [demoId, i, chunks[i], JSON.stringify(embeddings[i])]
    )
  }

  await query(
    `INSERT INTO demo_kb_meta (demo_id, source_hash, chunk_count, embedding_model, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (demo_id) DO UPDATE SET
       source_hash = EXCLUDED.source_hash,
       chunk_count = EXCLUDED.chunk_count,
       embedding_model = EXCLUDED.embedding_model,
       updated_at = NOW()`,
    [demoId, hash, chunks.length, EMBEDDING_MODEL]
  )

  return { chunks: chunks.length, skipped: false }
}

export type KbSearchHit = {
  chunk_index: number
  content: string
  score: number
}

/** Semantic search over indexed chunks for a demo. */
export async function searchDemoKnowledge(
  demoId: number,
  queryText: string,
  topK = 5
): Promise<KbSearchHit[]> {
  await ensureDemoKbTables()
  const q = queryText.trim()
  if (!q) return []

  const { rows } = await query<{
    chunk_index: number
    content: string
    embedding: unknown
  }>(
    `SELECT chunk_index, content, embedding FROM demo_kb_chunks WHERE demo_id = $1`,
    [demoId]
  )
  if (rows.length === 0) return []

  const [queryVec] = await openRouterEmbedTexts([q], { model: EMBEDDING_MODEL })
  const scored = rows
    .map((r) => ({
      chunk_index: r.chunk_index,
      content: r.content,
      score: cosineSimilarity(queryVec, parseEmbedding(r.embedding)),
    }))
    .filter((h) => h.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(topK, 1), 8))

  return scored
}

/** Whether this WhatsApp demo should use RAG tool (indexed chunks exist). */
export async function demoUsesRagTool(
  demoId: number,
  knowledgeText: string
): Promise<boolean> {
  const text = knowledgeText.trim()
  if (!text) return false
  // Short KB: full inject is fine and cheaper
  if (text.length <= DEMO_KB_FULL_INJECT_MAX_CHARS) return false
  const n = await countDemoKbChunks(demoId)
  return n > 0
}
