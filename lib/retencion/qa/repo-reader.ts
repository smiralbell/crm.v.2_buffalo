import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import type { GithubRepo } from './types'

/**
 * Lectura de un repositorio para el cerebro: GitHub (API con GITHUB_TOKEN, el mismo
 * acceso que el MCP de GitHub pero directo y solo de lectura) o una carpeta local con git
 * (solo en local o con QA_LOCAL_REPOS=1). Nunca escribe nada.
 */

export type RepoDiff = {
  commits: { sha: string; message: string }[]
  files: { path: string; patch: string }[]
}

export type RepoFile = { path: string; size: number }

export type RepoReader = {
  kind: 'github' | 'local'
  label: string
  head(): Promise<string | null>
  listFiles(): Promise<RepoFile[]>
  readFile(p: string): Promise<string | null>
  diffSince(sha: string): Promise<RepoDiff>
}

/** Un archivo enorme se recorta: con esto entran prompts y documentos largos enteros. */
export const MAX_FILE_CHARS = 120_000
const MAX_PATCH_CHARS = 6_000
const MAX_FILE_BYTES = 600_000

/* ───────────── Selección de archivos (pura, con tests) ───────────── */

const SKIP_DIRS = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|vendor|\.venv|venv|__pycache__|\.turbo|\.vercel|\.cache|uploads|public\/static|\.claude\/worktrees)(\/|$)/i
const SKIP_FILES = /(\.lock$|lock\.json$|bun\.lockb?$|\.min\.(js|css)$|\.map$|tsbuildinfo$|snapshot\.json$|\.test\.[jt]sx?$|\.spec\.[jt]sx?$)/i
const TEXT_EXT = /\.(md|mdx|txt|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|sql|py|html|env\.example)$/i
const LOGIC = /(prompt|agent|agente|tool|herramient|webhook|retell|whatsapp|voice|voz|chat|mcp|orquest|llm|openai|openrouter|elevenlabs|twilio|cron|follow|seguimiento|campa|formulario|email|correo|crm|lead|cita|deriv)/i

export function scoreRepoPath(p: string): number {
  const lower = p.toLowerCase()
  const name = lower.split('/').pop() || lower
  if (SKIP_DIRS.test(p) || SKIP_FILES.test(p)) return 0
  if (name === '.env.example') return 70
  if (!TEXT_EXT.test(name)) return 0
  if (['claude.md', 'agents.md', 'readme.md', 'claude.local.md'].includes(name) && !lower.includes('/')) return 100
  if (lower.endsWith('.md')) {
    if (/^docs\/(funcionalidades|referencia|integraciones|protocolos|retell|knowledge)/.test(lower)) return 92
    if (lower.startsWith('docs/')) return 88
    return 60
  }
  if (/prompt/.test(lower)) return 86
  if (name === 'package.json' && !lower.includes('/')) return 72
  if (LOGIC.test(lower)) return 78
  if (/(^|\/)(app|pages)\/api\//.test(lower) || /routes?\.[jt]s$/.test(lower)) return 55
  if (/\.(ts|tsx|js|jsx|py)$/.test(lower) && /(^|\/)(src|lib|server|modules|services)\//.test(lower)) return 30
  return 10
}

/** Archivos que se leen, de más a menos útiles para entender el sistema. */
export function selectRepoFiles<T extends { path: string }>(files: T[], limit = 400): T[] {
  return files
    .map((f) => ({ f, p: f.path.replace(/\\/g, '/'), s: scoreRepoPath(f.path.replace(/\\/g, '/')) }))
    .filter((x) => x.s >= 30)
    .sort((a, b) => b.s - a.s || a.p.length - b.p.length || a.p.localeCompare(b.p))
    .slice(0, limit)
    .map((x) => x.f)
}

/** Árbol del repositorio sin ruido, para dar contexto a la IA. */
export function visibleTree(paths: string[], limit = 2000): string[] {
  return paths
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => !SKIP_DIRS.test(p) && !SKIP_FILES.test(p))
    .sort()
    .slice(0, limit)
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…[recortado]` : text
}

/** Ejecuta `fn` sobre la lista con como mucho `n` a la vez, en orden de resultados. */
export async function mapLimit<T, R>(list: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      out[i] = await fn(list[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker))
  return out
}

/* ───────────── GitHub ───────────── */

export function parseGithubRepo(source: string): { owner: string; repo: string } | null {
  const s = source.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/)
  return m ? { owner: m[1], repo: m[2] } : null
}

function githubToken(): string | undefined {
  return process.env.GITHUB_TOKEN?.trim() || undefined
}

export function githubConfigured(): boolean {
  return Boolean(githubToken())
}

function ghHeaders(accept = 'application/vnd.github+json'): Record<string, string> {
  const token = githubToken()
  return {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'buffalo-crm',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function ghGet<T>(url: string, notFound: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders() })
  if (res.status === 404) throw new Error(notFound)
  if (res.status === 401) throw new Error('GitHub rechaza el token (GITHUB_TOKEN). Revísalo o genera uno nuevo.')
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

/** Repositorios a los que tiene acceso el token, del más reciente al más antiguo. */
export async function listGithubRepos(): Promise<GithubRepo[]> {
  if (!githubToken()) throw new Error('Falta GITHUB_TOKEN en las variables del CRM.')
  const out: GithubRepo[] = []
  for (let page = 1; page <= 5; page++) {
    const list = await ghGet<
      { full_name: string; private: boolean; default_branch: string; pushed_at: string | null; description: string | null; archived?: boolean }[]
    >(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`, 'GitHub no encuentra el usuario del token')
    for (const r of list) {
      if (!r.archived) out.push({ full_name: r.full_name, private: r.private, default_branch: r.default_branch, pushed_at: r.pushed_at, description: r.description })
    }
    if (list.length < 100) break
  }
  return out
}

export async function listGithubBranches(fullName: string): Promise<string[]> {
  const gh = parseGithubRepo(fullName)
  if (!gh) throw new Error('Repositorio no válido')
  const list = await ghGet<{ name: string }[]>(
    `https://api.github.com/repos/${gh.owner}/${gh.repo}/branches?per_page=100`,
    `GitHub no encuentra ${fullName}`
  )
  return list.map((b) => b.name)
}

function githubReader(owner: string, repo: string, branch: string | null): RepoReader {
  const api = `https://api.github.com/repos/${owner}/${repo}`
  const notFound = githubToken()
    ? `GitHub no encuentra ${owner}/${repo} o el token no tiene acceso.`
    : `GitHub no encuentra ${owner}/${repo}. Si es privado, añade GITHUB_TOKEN en las variables del CRM.`
  let resolvedSha: string | null = null
  const ref = async (): Promise<string> => {
    if (resolvedSha) return resolvedSha
    const b = branch || (await ghGet<{ default_branch: string }>(api, notFound)).default_branch
    resolvedSha = (await ghGet<{ sha: string }>(`${api}/commits/${encodeURIComponent(b)}`, notFound)).sha
    return resolvedSha
  }
  return {
    kind: 'github',
    label: `${owner}/${repo}`,
    head: async () => ref(),
    listFiles: async () => {
      const sha = await ref()
      const tree = await ghGet<{ tree: { path: string; type: string; size?: number }[] }>(`${api}/git/trees/${sha}?recursive=1`, notFound)
      return tree.tree.filter((t) => t.type === 'blob' && (t.size ?? 0) < MAX_FILE_BYTES).map((t) => ({ path: t.path, size: t.size ?? 0 }))
    },
    readFile: async (p) => {
      const sha = await ref()
      const res = await fetch(`${api}/contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`, {
        headers: ghHeaders('application/vnd.github.raw'),
      })
      if (!res.ok) return null
      return clip(await res.text(), MAX_FILE_CHARS)
    },
    diffSince: async (baseSha) => {
      const head = await ref()
      const cmp = await ghGet<{
        commits: { sha: string; commit: { message: string } }[]
        files?: { filename: string; patch?: string }[]
      }>(`${api}/compare/${baseSha}...${head}`, notFound)
      return {
        commits: cmp.commits.map((c) => ({ sha: c.sha, message: c.commit.message.split('\n')[0] })),
        files: (cmp.files || []).map((f) => ({ path: f.filename, patch: clip(f.patch || '(binario o demasiado grande)', MAX_PATCH_CHARS) })),
      }
    },
  }
}

/* ───────────── Carpeta local ───────────── */

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 20 * 1024 * 1024, timeout: 30_000 }, (err, stdout) => {
      if (err) reject(new Error(`git ${args[0]}: ${err.message.split('\n')[0]}`))
      else resolve(stdout)
    })
  })
}

export function localReposAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.QA_LOCAL_REPOS === '1'
}

function localReader(root: string, branch: string | null): RepoReader {
  const abs = path.resolve(root)
  const inside = (p: string) => {
    const full = path.resolve(abs, p)
    if (full !== abs && !full.startsWith(abs + path.sep)) throw new Error('Ruta fuera del repositorio')
    return full
  }
  const rev = branch || 'HEAD'
  const withSize = async (paths: string[]): Promise<RepoFile[]> =>
    (
      await mapLimit(paths, 16, async (p) => {
        const st = await fs.stat(inside(p)).catch(() => null)
        return st && st.isFile() && st.size < MAX_FILE_BYTES ? { path: p, size: st.size } : null
      })
    ).filter((x): x is RepoFile => Boolean(x))
  return {
    kind: 'local',
    label: path.basename(abs),
    head: async () => (await git(abs, ['rev-parse', rev])).trim() || null,
    listFiles: async () => {
      try {
        return await withSize((await git(abs, ['ls-files'])).split('\n').map((s) => s.trim()).filter(Boolean))
      } catch {
        // Sin git: recorrido simple de la carpeta.
        const out: string[] = []
        const walk = async (dir: string, rel: string) => {
          if (out.length > 5000) return
          for (const e of await fs.readdir(dir, { withFileTypes: true })) {
            const r = rel ? `${rel}/${e.name}` : e.name
            if (SKIP_DIRS.test(r)) continue
            if (e.isDirectory()) await walk(path.join(dir, e.name), r)
            else out.push(r)
          }
        }
        await walk(abs, '')
        return withSize(out)
      }
    },
    readFile: async (p) => {
      try {
        return clip(await fs.readFile(inside(p), 'utf8'), MAX_FILE_CHARS)
      } catch {
        return null
      }
    },
    diffSince: async (baseSha) => {
      const log = await git(abs, ['log', `${baseSha}..${rev}`, '--format=%H%x09%s'])
      const commits = log
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [sha, ...rest] = l.split('\t')
          return { sha, message: rest.join('\t') }
        })
      const diff = await git(abs, ['diff', `${baseSha}..${rev}`, '--', '.', ':(exclude)*.lock', ':(exclude)*lock.json'])
      const files = diff
        .split(/^diff --git /m)
        .filter(Boolean)
        .map((chunk) => {
          const m = chunk.match(/^a\/(\S+)/)
          return { path: m ? m[1] : '?', patch: clip(chunk, MAX_PATCH_CHARS) }
        })
      return { commits, files }
    },
  }
}

export async function makeRepoReader(source: string, branch: string | null): Promise<RepoReader> {
  const gh = parseGithubRepo(source)
  if (gh) return githubReader(gh.owner, gh.repo, branch)
  if (!localReposAllowed()) throw new Error('Las carpetas locales solo se pueden leer con el CRM en local. Elige un repositorio de GitHub.')
  const stat = await fs.stat(source).catch(() => null)
  if (!stat?.isDirectory()) throw new Error(`No existe la carpeta ${source}`)
  return localReader(source, branch)
}
