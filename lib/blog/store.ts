/**
 * Almacén del módulo Blog.
 *
 * Todo el módulo guarda documentos JSON en UNA tabla propia (blog_docs),
 * agrupados por colección: posts, topics, slots, settings, rules, runs,
 * images. Así no se mezcla con ninguna tabla del resto del CRM.
 *
 * Con BLOG_STORE=file guarda en .data/blog/*.json en lugar de Postgres.
 * Sirve para probar el módulo en local sin tocar la base de datos.
 * En Postgres la tabla se crea sola la primera vez (CREATE TABLE IF NOT EXISTS,
 * lo mismo que prisma/CREATE_BLOG_ENGINE.sql); no toca ninguna otra tabla.
 */
import fs from 'fs'
import path from 'path'
import { getPool } from '@/lib/db'

export type Collection = 'posts' | 'topics' | 'slots' | 'settings' | 'rules' | 'runs' | 'images'

const fileMode = () => process.env.BLOG_STORE === 'file'
// BLOG_FILE_DIR permite usar otra carpeta (por ejemplo, para pruebas sin tocar los datos del panel)
const FILE_DIR = process.env.BLOG_FILE_DIR ? path.resolve(process.env.BLOG_FILE_DIR) : path.join(process.cwd(), '.data', 'blog')

/* ---------- Backend de ficheros (local) ---------- */

function fileRead(col: Collection): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.join(FILE_DIR, col + '.json'), 'utf8'))
  } catch {
    return {}
  }
}

function fileWrite(col: Collection, data: Record<string, unknown>) {
  fs.mkdirSync(FILE_DIR, { recursive: true })
  const target = path.join(FILE_DIR, col + '.json')
  const tmp = target + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1))
  // En Windows el antivirus a veces bloquea el fichero un instante: reintentar y, si no, escribir directo
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmp, target)
      return
    } catch {
      const until = Date.now() + 40
      while (Date.now() < until) {
        /* espera corta */
      }
    }
  }
  fs.copyFileSync(tmp, target)
  fs.rmSync(tmp, { force: true })
}

/* ---------- Postgres ---------- */

let ready: Promise<void> | null = null
function db() {
  if (!ready) {
    ready = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS blog_docs (
           collection TEXT NOT NULL,
           id TEXT NOT NULL,
           data JSONB NOT NULL,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           PRIMARY KEY (collection, id)
         );
         CREATE INDEX IF NOT EXISTS blog_docs_collection_idx ON blog_docs (collection);`
      )
      .then(() => undefined)
      .catch((e) => {
        ready = null // se reintenta en la próxima llamada
        throw e
      })
  }
  return ready.then(() => getPool())
}

/* ---------- API común ---------- */

export async function list<T>(col: Collection): Promise<T[]> {
  if (fileMode()) return Object.values(fileRead(col)) as T[]
  const { rows } = await (await db()).query('SELECT data FROM blog_docs WHERE collection = $1', [col])
  return rows.map((r) => r.data as T)
}

export async function get<T>(col: Collection, id: string): Promise<T | null> {
  if (fileMode()) return ((fileRead(col)[id] as T) ?? null)
  const { rows } = await (await db()).query('SELECT data FROM blog_docs WHERE collection = $1 AND id = $2', [col, id])
  return rows[0] ? (rows[0].data as T) : null
}

export async function put<T extends { id: string }>(col: Collection, doc: T): Promise<T> {
  if (fileMode()) {
    const all = fileRead(col)
    all[doc.id] = doc
    fileWrite(col, all)
    return doc
  }
  await (await db()).query(
    `INSERT INTO blog_docs (collection, id, data, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [col, doc.id, JSON.stringify(doc)]
  )
  return doc
}

export async function putMany<T extends { id: string }>(col: Collection, docs: T[]) {
  if (fileMode()) {
    const all = fileRead(col)
    for (const d of docs) all[d.id] = d
    fileWrite(col, all)
    return
  }
  for (const d of docs) await put(col, d)
}

export async function remove(col: Collection, id: string) {
  if (fileMode()) {
    const all = fileRead(col)
    delete all[id]
    fileWrite(col, all)
    return
  }
  await (await db()).query('DELETE FROM blog_docs WHERE collection = $1 AND id = $2', [col, id])
}

/** ¿Está creada la tabla? Para avisar en el panel en lugar de dar un error 500. */
export async function storeStatus(): Promise<{ ok: boolean; mode: 'file' | 'postgres'; message?: string }> {
  if (fileMode()) return { ok: true, mode: 'file' }
  try {
    await (await db()).query('SELECT 1 FROM blog_docs LIMIT 1')
    return { ok: true, mode: 'postgres' }
  } catch (e) {
    return {
      ok: false,
      mode: 'postgres',
      message: 'No se pudo crear o leer la tabla blog_docs: ' + (e instanceof Error ? e.message : String(e)),
    }
  }
}

export function newId(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
