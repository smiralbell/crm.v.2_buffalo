import { describe, expect, it } from 'vitest'
import {
  analyseNotesHeuristic,
  TOPICS,
} from './topics'
import { atTokenAtCaret, buildHighlightHtml, wordCount } from './ui-helpers'
import { type ProjectNote } from './types'

function formatNotes(notes: ProjectNote[]): string {
  const usable = notes.filter((n) => n.body.trim())
  if (!usable.length) return ''
  return (
    '## Notas del cuaderno\n' +
    usable
      .map(
        (n) =>
          `### ${n.title || 'Sin título'} (${n.note_date} · ${n.type})\n${n.body.trim()}`
      )
      .join('\n\n')
  )
}

describe('analyseNotesHeuristic', () => {
  it('marca volumen y canales cuando hay keywords', () => {
    const text =
      'Reciben 900 consultas al mes por WhatsApp y 1400 llamadas. Usan Doctoralia.'
    const r = analyseNotesHeuristic({ notesText: text })
    expect(r.cubiertos).toEqual(
      expect.arrayContaining(['volumen', 'canales', 'herramientas'])
    )
    expect(r.preguntas.some((p) => p.tipo === 'hueco')).toBe(true)
    expect(r.preguntas.length).toBeLessThanOrEqual(12)
  })

  it('incluye ganchos web primero', () => {
    const r = analyseNotesHeuristic({
      notesText: 'hola',
      researchGanchos: ['¿Cuántas citas por la web?'],
    })
    expect(r.preguntas[0]?.tipo).toBe('web')
    expect(r.preguntas[0]?.texto).toMatch(/citas/)
  })

  it('cubre como máximo todos los topics', () => {
    const text = TOPICS.flatMap((t) => t.kw).join(' ')
    const r = analyseNotesHeuristic({ notesText: text })
    expect(r.cubiertos.length).toBe(TOPICS.length)
  })
})

describe('ui-helpers', () => {
  it('cuenta palabras', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('  uno dos  ')).toBe(2)
  })

  it('detecta @token delante del caret', () => {
    const v = 'hola @inv'
    expect(atTokenAtCaret(v, v.length)).toEqual({ start: 5, query: 'inv' })
    expect(atTokenAtCaret('correo@dominio.com', 18)).toBeNull()
  })

  it('pinta bloques de investigación', () => {
    const text = 'antes\n┌ INV\n│ x\n└ fin\ndespues'
    const html = buildHighlightHtml(text)
    expect(html).toContain('hl-res')
    expect(html).toContain('antes')
  })
})

describe('notesToContextBlock', () => {
  it('formatea notas no vacías', () => {
    const notes: ProjectNote[] = [
      {
        id: '1',
        lead_id: 1,
        note_date: '2026-07-30',
        type: 'reunion',
        title: 'Kickoff',
        body: 'Texto de prueba',
        created_by: null,
        created_at: '2026-07-30T10:00:00.000Z',
        updated_at: '2026-07-30T10:00:00.000Z',
      },
      {
        id: '2',
        lead_id: 1,
        note_date: '2026-07-30',
        type: 'libre',
        title: '',
        body: '   ',
        created_by: null,
        created_at: '2026-07-30T10:00:00.000Z',
        updated_at: '2026-07-30T10:00:00.000Z',
      },
    ]
    const block = formatNotes(notes)
    expect(block).toMatch(/Notas del cuaderno/)
    expect(block).toMatch(/Kickoff/)
    expect(block).toMatch(/Texto de prueba/)
    expect(block).not.toMatch(/Sin título/)
  })
})
