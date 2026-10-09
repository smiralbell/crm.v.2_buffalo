/**
 * Almacén del módulo Blog.
 *
 * Todo el módulo guarda documentos JSON en UNA tabla propia (blog_docs),
 * agrupados por colección: posts, topics, slots, settings, rules, runs,
 * images. Así no se mezcla con ninguna tabla del resto del CRM.
 *
 * Con BLOG_STORE=file guarda en .data/blog/*.json en lugar de Postgres.
 * Sirve para probar el módulo en local sin tocar la base de datos.
 * Para producción: ejecutar prisma/CREATE_BLOG_ENGINE.sql una vez.
 */
import fs from 'fs'
import path from 'path'
import { getPool } from '@/lib/db'

export type Collection = 'posts' | 'topics' | 'slots' | 'settings' | 'rules' | 'runs' | 'images'

const fileMode = () => process.env.BLOG_STORE === 'file'
const FILE_DIR = path.join(process.cwd(), '.data', 'blog')

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

/* ---------- API común ---------- */

export async function list<T>(col: Collection): Promise<T[]> {
  if (fileMode()) return Object.values(fileRead(col)) as T[]
  const { rows } = await getPool().query('SELECT data FROM blog_docs WHERE collection = $1', [col])
  return rows.map((r) => r.data as T)
}

export async function get<T>(col: Collection, id: string): Promise<T | null> {
  if (fileMode()) return ((fileRead(col)[id] as T) ?? null)
  const { rows } = await getPool().query('SELECT data FROM blog_docs WHERE collection = $1 AND id = $2', [col, id])
  return rows[0] ? (rows[0].data as T) : null
}

export async function put<T extends { id: string }>(col: Collection, doc: T): Promise<T> {
  if (fileMode()) {
    const all = fileRead(col)
    all[doc.id] = doc
    fileWrite(col, all)
    return doc
  }
  await getPool().query(
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
  await getPool().query('DELETE FROM blog_docs WHERE collection = $1 AND id = $2', [col, id])
}

/** ¿Está creada la tabla? Para avisar en el panel en lugar de dar un error 500. */
export async function storeStatus(): Promise<{ ok: boolean; mode: 'file' | 'postgres'; message?: string }> {
  if (fileMode()) return { ok: true, mode: 'file' }
  try {
    await getPool().query('SELECT 1 FROM blog_docs LIMIT 1')
    return { ok: true, mode: 'postgres' }
  } catch (e) {
    return {
      ok: false,
      mode: 'postgres',
      message: 'Falta la tabla blog_docs: ejecuta prisma/CREATE_BLOG_ENGINE.sql en la base de datos.',
    }
  }
}

export function newId(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
