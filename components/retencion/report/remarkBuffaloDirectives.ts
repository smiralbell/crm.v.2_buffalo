import { detectSemaforo, stripEmojis } from './buffaloTheme'

/**
 * Normaliza las directivas BRM (remark-directive) a elementos `bf-*` y limpia el
 * árbol: quita emojis de los textos y detecta el semáforo (Verde/Ámbar/Rojo) al
 * inicio de un callout para convertirlo en una píldora de color.
 *
 * BRM soportado: kpi-grid, kpi, callout, highlight, roi, checklist.
 */

const KNOWN = new Set([
  'kpi-grid',
  'kpi',
  'callout',
  'highlight',
  'roi',
  'checklist',
  'chart',
])

type MdNode = {
  type: string
  name?: string
  value?: string
  checked?: boolean | null
  attributes?: Record<string, string | null | undefined>
  children?: MdNode[]
  data?: {
    hName?: string
    hProperties?: Record<string, unknown>
  }
}

export function remarkBuffaloDirectives() {
  return (tree: unknown) => {
    walk(tree as MdNode)
  }
}

function walk(node: MdNode) {
  if (!node || typeof node !== 'object') return

  if (node.type === 'text' && typeof node.value === 'string') {
    node.value = stripEmojis(node.value)
  }

  if (
    node.type === 'containerDirective' ||
    node.type === 'leafDirective' ||
    node.type === 'textDirective'
  ) {
    const name = node.name || ''
    if (KNOWN.has(name)) {
      const attrs = cleanAttrs(node.attributes || {})
      const data = (node.data = node.data || {})
      data.hName = `bf-${name}`
      data.hProperties = { ...attrs, 'data-brm': name }
      if (name === 'checklist') normalizeChecklist(node)
      if (name === 'callout') normalizeCallout(node)
      if (name === 'chart') normalizeChart(node)
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child)
  }
}

/** Convierte la lista de tareas interna en filas bf-checklist-item. */
function normalizeChecklist(node: MdNode) {
  const list = (node.children || []).find((c) => c.type === 'list')
  if (!list || !list.children) return
  list.data = list.data || {}
  list.data.hName = 'div'
  list.data.hProperties = { className: 'bf-checklist-rows' }

  for (const item of list.children) {
    if (item.type !== 'listItem') continue
    const checked = item.checked === true
    item.checked = null
    item.data = item.data || {}
    item.data.hName = 'bf-checklist-item'
    item.data.hProperties = { 'data-checked': checked ? 'true' : 'false' }
  }
}

/** Detecta semáforo (Verde/Ámbar/Rojo) al inicio del callout y lo marca. */
function normalizeCallout(node: MdNode) {
  const firstPara = (node.children || []).find((c) => c.type === 'paragraph')
  const firstText = firstPara?.children?.find((c) => c.type === 'text')
  if (!firstText || typeof firstText.value !== 'string') return

  const m = /^\s*(verde|[aá]mbar|rojo)\b\s*[:.\-–]?\s*/i.exec(firstText.value)
  if (!m) return
  const level = detectSemaforo(m[1])
  if (!level) return

  // marca el nivel y elimina la palabra del texto
  const data = (node.data = node.data || {})
  data.hProperties = { ...(data.hProperties || {}), 'data-semaforo': level }
  firstText.value = firstText.value.slice(m[0].length)
}

/** Extrae texto plano de un nodo mdast (concatena hijos de texto). */
function nodeText(node: MdNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value || ''
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

/**
 * Convierte la tabla GFM interna de un :::chart en { columns, rows } y la
 * guarda como data-chart (JSON). Mantiene la tabla como fallback si el
 * gráfico no puede dibujarse (se conserva en data-chart-table para el render).
 */
function normalizeChart(node: MdNode) {
  const table = (node.children || []).find((c) => c.type === 'table')
  if (!table || !Array.isArray(table.children)) return
  const trs = table.children.filter((c) => c.type === 'tableRow')
  if (trs.length === 0) return
  const toCells = (tr: MdNode): string[] =>
    (tr.children || [])
      .filter((c) => c.type === 'tableCell')
      .map((c) => nodeText(c).trim())
  const columns = toCells(trs[0])
  const rows = trs.slice(1).map(toCells)

  const data = (node.data = node.data || {})
  data.hProperties = {
    ...(data.hProperties || {}),
    'data-chart': JSON.stringify({ columns, rows }),
  }
  // Elimina los hijos para no renderizar la tabla dos veces (el componente la
  // reconstruye desde data-chart si necesita el fallback).
  node.children = []
}

function cleanAttrs(
  attrs: Record<string, string | null | undefined>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}
