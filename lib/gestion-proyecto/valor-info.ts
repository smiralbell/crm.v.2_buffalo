export type ProjectPasswordEntry = {
  id: string
  label: string
  username: string
  password: string
  url: string
  notes: string
}

export type ProjectValorInfo = {
  repo_url: string
  passwords: ProjectPasswordEntry[]
}

export function emptyValorInfo(): ProjectValorInfo {
  return { repo_url: '', passwords: [] }
}

export function newPasswordId(): string {
  return `pwd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function normalizePasswordEntry(raw: unknown): ProjectPasswordEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const label = String(o.label ?? '').trim()
  if (!label) return null
  return {
    id: String(o.id || newPasswordId()),
    label,
    username: String(o.username ?? '').trim(),
    password: String(o.password ?? ''),
    url: String(o.url ?? '').trim(),
    notes: String(o.notes ?? '').trim(),
  }
}

export function parseValorInfo(repoUrl: unknown, passwordsJson: unknown): ProjectValorInfo {
  let passwords: ProjectPasswordEntry[] = []
  const rawList = Array.isArray(passwordsJson)
    ? passwordsJson
    : typeof passwordsJson === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(passwordsJson)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })()
      : []

  for (const item of rawList) {
    const entry = normalizePasswordEntry(item)
    if (entry) passwords.push(entry)
  }

  return {
    repo_url: String(repoUrl ?? '').trim(),
    passwords,
  }
}
