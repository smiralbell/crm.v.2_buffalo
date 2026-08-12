/** Helpers de UI del cuaderno (resaltado espejo + menú @). */

export const RES_ABRE = '┌'
export const RES_CIERRA = '└'

export function wordCount(t: string): number {
  const s = (t || '').trim()
  return s ? s.split(/\s+/).length : 0
}

export function escHtml(s: string): string {
  return String(s || '').replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string
  )
}

export function typeLabel(t: string): string {
  return t === 'reunion' ? 'Reunión' : t === 'definicion' ? 'Definición' : 'Nota'
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function labelDate(d: string): string {
  const t = isoToday()
  const yDate = new Date()
  yDate.setDate(yDate.getDate() - 1)
  const y = yDate.toISOString().slice(0, 10)
  const fmt = (x: string) =>
    new Date(x + 'T12:00:00').toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  if (d === t) return 'Hoy · ' + fmt(d)
  if (d === y) return 'Ayer · ' + fmt(d)
  return fmt(d)
}

/** Partes HTML para la capa espejo de investigación. */
export function buildHighlightHtml(text: string): string {
  const partes: Array<{ res: boolean; txt: string }> = []
  let buf: string[] = []
  let dentro = false
  const volcar = (esRes: boolean) => {
    if (buf.length) partes.push({ res: esRes, txt: buf.join('\n') })
    buf = []
  }
  for (const linea of text.split('\n')) {
    if (linea.startsWith(RES_ABRE) && !dentro) {
      volcar(false)
      dentro = true
    }
    buf.push(linea)
    if (linea.startsWith(RES_CIERRA) && dentro) {
      volcar(true)
      dentro = false
    }
  }
  volcar(dentro)
  return (
    partes
      .map((p) =>
        p.res
          ? `<span class="hl-res">${escHtml(p.txt)}</span>`
          : escHtml(p.txt)
      )
      .join('\n') + (text.endsWith('\n') ? '\n' : '')
  )
}

const AT_RE = (() => {
  try {
    return new RegExp('(?:^|[^\\p{L}\\p{N}@])@([\\p{L}\\p{N}_-]*)$', 'u')
  } catch {
    return /(?:^|[^A-Za-zÀ-ÿ0-9@])@([A-Za-zÀ-ÿ0-9_-]*)$/
  }
})()

export function atTokenAtCaret(
  value: string,
  caret: number
): { start: number; query: string } | null {
  const antes = value.slice(0, caret)
  const m = AT_RE.exec(antes)
  if (!m) return null
  return { start: caret - m[1].length - 1, query: m[1] }
}

export type Atajo = {
  id: string
  ico: string
  n: string
  h: string
}

export const ATAJOS: Atajo[] = [
  {
    id: 'investigar',
    ico: '🔍',
    n: 'Investigar cliente',
    h: 'Pega su web y saca una ficha de quiénes son',
  },
  {
    id: 'pregunta',
    ico: '❓',
    n: 'Pregunta del copiloto',
    h: 'Inserta la siguiente pregunta sugerida',
  },
  {
    id: 'accion',
    ico: '✅',
    n: 'Acción pendiente',
    h: 'Marca un to-do dentro de la nota',
  },
  {
    id: 'fecha',
    ico: '📅',
    n: 'Fecha de hoy',
    h: 'Inserta la fecha',
  },
]

export function filterAtajos(query: string): Atajo[] {
  const q = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!q) return ATAJOS
  return ATAJOS.filter(
    (a) =>
      a.n
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .includes(q) || a.id.includes(q)
  )
}

/** Posición del caret en viewport (mirror div). */
export function caretXY(
  el: HTMLTextAreaElement
): { x: number; y: number } {
  const cs = getComputedStyle(el)
  const div = document.createElement('div')
  for (const p of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderWidth',
    'boxSizing',
    'textTransform',
  ] as const) {
    div.style[p] = cs[p]
  }
  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.style.wordWrap = 'break-word'
  div.style.width = el.clientWidth + 'px'
  div.textContent = el.value.slice(0, el.selectionStart)
  const mark = document.createElement('span')
  mark.textContent = '\u200b'
  div.appendChild(mark)
  document.body.appendChild(div)
  const r = el.getBoundingClientRect()
  const x = r.left + mark.offsetLeft
  const y = r.top + mark.offsetTop - el.scrollTop
  document.body.removeChild(div)
  return { x, y }
}
