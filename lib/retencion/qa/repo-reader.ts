import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Lectura de un repositorio para el cerebro: GitHub (API, con GITHUB_TOKEN si es privado)
 * o una carpeta local con git (solo en local o con QA_LOCAL_REPOS=1). Nunca escribe nada.
 */

export type RepoDiff = {
  commits: { sha: string; message: string }[]
  files: { path: string; patch: string }[]
}

export type RepoReader = {
  kind: 'github' | 'local'
  label: string
  head(): Promise<string | null>
  listFiles(): Promise<string[]>
  readFile(p: string): Promise<string | null>
  diffSince(sha: string): Promise<RepoDiff>
}

const MAX_FILE_CHARS = 15_000
const MAX_PATCH_CHARS = 6_000

/* ───────────── Selección de archivos (pura, con tests) ───────────── */

const SKIP_DIRS = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|vendor|\.venv|venv|__pycache__|\.turbo|\.vercel|\.cache|uploads|public\/static)(\/|$)/i
const SKIP_FILES = /(\.lock$|lock\.json$|bun\.lockb?$|\.min\.(js|css)$|\.map$|tsbuildinfo$|snapshot\.json$|\.test\.[jt]sx?$|\.spec\.[jt]sx?$)/i
const TEXT_EXT = /\.(md|mdx|txt|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|sql|py|html|env\.example)$/i
const LOGIC = /(prompt|agent|agente|tool|herramient|webhook|retell|whatsapp|voice|voz|chat|mcp|orquest|llm|openai|openrouter|elevenlabs|twilio|cron|follow|seguimiento|campa|formulario|email|correo|crm)/i

export function scoreRepoPath(p: string): number {
  const lower = p.toLowerCase()
  const base = lower.split('/').pop() || lower
  if (SKIP_DIRS.test(p) || SKIP_FILES.test(p)) return 0
  if (base === '.env.example') return 70
  if (!TEXT_EXT.test(base)) return 0
  if (['claude.md', 'agents.md', 'readme.md', 'claude.local.md'].includes(base) && !lower.includes('/')) return 100
  if (lower.endsWith('.md')) {
    if (/^docs\/(funcionalidades|referencia|integraciones|protocolos|retell|knowledge)/.test(lower)) return 92
    if (lower.startsWith('docs/')) return 88
    return 60
  }
  if (/prompt/.test(lower)) return 86
  if (base === 'package.json' && !lower.includes('/')) return 72
  if (LOGIC.test(lower)) return 78
  if (/(^|\/)(app|pages)\/api\//.test(lower) || /routes?\.[jt]s$/.test(lower)) return 55
  if (/\.(ts|tsx|js|jsx|py)$/.test(lower) && /(^|\/)(src|lib|server|modules|services)\//.test(lower)) return 30
  return 10
}

/** Archivos que se leen, de más a menos útiles para entender el sistema. */
export function selectRepoFiles(paths: string[], limit = 140): string[] {
  return paths
    .map((p) => ({ p: p.replace(/\\/g, '/'), s: scoreRepoPath(p.replace(/\\/g, '/')) }))
    .filter((x) => x.s >= 30)
    .sort((a, b) => b.s - a.s || a.p.length - b.p.length || a.p.localeCompare(b.p))
    .slice(0, limit)
    .map((x) => x.p)
}

/** Árbol del repositorio sin ruido, para dar contexto a la IA. */
export function visibleTree(paths: string[], limit = 1500): string[] {
  return paths
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => !SKIP_DIRS.test(p) && !SKIP_FILES.test(p))
    .sort()
    .slice(0, limit)
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…[recortado]` : text
}

/* ───────────── GitHub ───────────── */

export function parseGithubRepo(source: string): { owner: string; repo: string } | null {
  const s = source.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/)
  return m ? { owner: m[1], repo: m[2] } : null
}

function githubReader(owner: string, repo: string, branch: string | null): RepoReader {
  const token = process.env.GITHUB_TOKEN?.trim()
  const api = `https://api.github.com/repos/${owner}/${repo}`
  const headers = (accept = 'application/vnd.github+json'): Record<string, string> => ({
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'buffalo-crm',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  })
  const get = async <T>(url: string): Promise<T> => {
    const res = await fetch(url, { headers: headers() })
    if (res.status === 404) {
      throw new Error(
        token
          ? `GitHub no encuentra ${owner}/${repo} o el token no tiene acceso.`
          : `GitHub no encuentra ${owner}/${repo}. Si es privado, añade GITHUB_TOKEN en las variables del CRM.`
      )
    }
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()) as T
  }
  let resolvedSha: string | null = null
  const ref = async (): Promise<string> => {
    if (resolvedSha) return resolvedSha
    const b = branch || (await get<{ default_branch: string }>(api)).default_branch
    resolvedSha = (await get<{ sha: string }>(`${api}/commits/${encodeURIComponent(b)}`)).sha
    return resolvedSha
  }
  return {
    kind: 'github',
    label: `${owner}/${repo}`,
    head: async () => ref(),
    listFiles: async () => {
      const sha = await ref()
      const tree = await get<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
        `${api}/git/trees/${sha}?recursive=1`
      )
      return tree.tree.filter((t) => t.type === 'blob' && (t.size ?? 0) < 400_000).map((t) => t.path)
    },
    readFile: async (p) => {
      const sha = await ref()
      const res = await fetch(`${api}/contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`, {
        headers: headers('application/vnd.github.raw'),
      })
      if (!res.ok) return null
      return clip(await res.text(), MAX_FILE_CHARS)
    },
    diffSince: async (base) => {
      const head = await ref()
      const cmp = await get<{
        commits: { sha: string; commit: { message: string } }[]
        files?: { filename: string; patch?: string }[]
      }>(`${api}/compare/${base}...${head}`)
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
  return {
    kind: 'local',
    label: path.basename(abs),
    head: async () => (await git(abs, ['rev-parse', rev])).trim() || null,
    listFiles: async () => {
      try {
        return (await git(abs, ['ls-files'])).split('\n').map((s) => s.trim()).filter(Boolean)
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
        return out
      }
    },
    readFile: async (p) => {
      try {
        return clip(await fs.readFile(inside(p), 'utf8'), MAX_FILE_CHARS)
      } catch {
        return null
      }
    },
    diffSince: async (base) => {
      const log = await git(abs, ['log', `${base}..${rev}`, '--format=%H%x09%s'])
      const commits = log
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [sha, ...rest] = l.split('\t')
          return { sha, message: rest.join('\t') }
        })
      const diff = await git(abs, ['diff', `${base}..${rev}`, '--', '.', ':(exclude)*.lock', ':(exclude)*lock.json'])
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
  if (!localReposAllowed()) throw new Error('Las carpetas locales solo se pueden leer con el CRM en local. Usa la URL de GitHub.')
  const stat = await fs.stat(source).catch(() => null)
  if (!stat?.isDirectory()) throw new Error(`No existe la carpeta ${source}`)
  return localReader(source, branch)
}
