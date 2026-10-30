/**
 * Un MCP solo se conecta si TODAS sus herramientas son de solo lectura:
 *  - declaran annotations.readOnlyHint = true (y no destructiveHint = true), y
 *  - su nombre no es de escritura (create, delete, enviar…), por si el servidor declara mal.
 * Se comprueba al conectar y otra vez antes de cada uso.
 */

export type McpToolInfo = {
  name: string
  description?: string
  inputSchema?: unknown
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string } | null
}

export type ReadOnlyCheck = {
  ok: boolean
  /** Herramientas que impiden conectar, con el motivo. */
  bloqueadas: { name: string; motivo: string }[]
}

const WRITE_WORDS = new Set([
  'create', 'crear', 'add', 'anadir', 'nuevo', 'new',
  'update', 'actualizar', 'edit', 'editar', 'modify', 'modificar', 'set', 'change', 'cambiar', 'rename', 'renombrar',
  'delete', 'borrar', 'eliminar', 'remove', 'quitar', 'drop', 'truncate', 'purge', 'destroy', 'trash',
  'insert', 'insertar', 'upsert', 'write', 'escribir', 'save', 'guardar', 'store', 'put', 'patch', 'post',
  'send', 'enviar', 'mandar', 'reply', 'responder', 'forward', 'reenviar', 'notify', 'notificar', 'email', 'sms', 'call', 'llamar',
  'exec', 'execute', 'ejecutar', 'run', 'lanzar', 'trigger', 'deploy', 'desplegar', 'publish', 'publicar',
  'upload', 'subir', 'import', 'importar', 'move', 'mover', 'copy', 'copiar', 'merge', 'archive', 'archivar',
  'share', 'compartir', 'grant', 'revoke', 'invite', 'invitar', 'assign', 'asignar',
  'cancel', 'cancelar', 'approve', 'aprobar', 'reject', 'rechazar', 'pay', 'pagar', 'charge', 'cobrar', 'refund',
  'mark', 'marcar', 'label', 'etiquetar', 'apply', 'aplicar', 'enable', 'disable', 'activar', 'desactivar',
  'start', 'stop', 'restart', 'reset', 'book', 'reservar', 'schedule', 'programar', 'agendar', 'register', 'registrar',
])

/** Palabras de un nombre de herramienta: snake_case, kebab-case, camelCase y puntos. */
export function toolWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Verbos de lectura: si el nombre empieza así (o tras un prefijo), «get_schedule» no cuenta como escritura. */
const READ_WORDS = new Set([
  'get', 'list', 'listar', 'ver', 'view', 'show', 'mostrar', 'read', 'leer', 'search', 'buscar', 'find', 'encontrar',
  'query', 'consultar', 'fetch', 'obtener', 'describe', 'describir', 'count', 'contar', 'check', 'comprobar',
  'lookup', 'resumen', 'summary', 'estado', 'status', 'info', 'stats', 'estadisticas', 'download', 'export', 'exportar',
])

/** La palabra de escritura que delata a la herramienta, o null si parece de lectura. */
export function writeWordIn(name: string): string | null {
  const words = toolWords(name)
  if (words.slice(0, 2).some((w) => READ_WORDS.has(w))) return null
  return words.find((w) => WRITE_WORDS.has(w)) || null
}

export function checkReadOnly(tools: McpToolInfo[]): ReadOnlyCheck {
  const bloqueadas: ReadOnlyCheck['bloqueadas'] = []
  for (const t of tools) {
    const a = t.annotations || {}
    const verb = writeWordIn(t.name)
    if (a.destructiveHint === true) bloqueadas.push({ name: t.name, motivo: 'se declara destructiva' })
    else if (a.readOnlyHint !== true) bloqueadas.push({ name: t.name, motivo: 'no declara readOnlyHint: true' })
    else if (verb) bloqueadas.push({ name: t.name, motivo: `el nombre indica escritura («${verb}»)` })
  }
  return { ok: bloqueadas.length === 0, bloqueadas }
}

export function describeBlocked(check: ReadOnlyCheck): string {
  const list = check.bloqueadas.slice(0, 8).map((b) => `${b.name} (${b.motivo})`).join(', ')
  const more = check.bloqueadas.length > 8 ? ` y ${check.bloqueadas.length - 8} más` : ''
  return `Este MCP no es de solo lectura. Herramientas que lo impiden: ${list}${more}. Cada herramienta debe declarar annotations.readOnlyHint = true y no escribir nada.`
}
