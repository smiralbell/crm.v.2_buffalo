import { describe, expect, it } from 'vitest'
import {
  extractProjectBrief,
  looksLikeResearchFiche,
  pickProjectSummaryText,
  sanitizeProjectTitle,
  stripResearchFiches,
} from '@/lib/onboarding/format-project-summary'

const BRIEF =
  'basicamente s una empresaque quiere crear u sistema de llamadas oubtound para promocionar sus servicios, ellos tiene bases de leads enromaes y quieren lanzar un sistema de aproxiamdamente 1000 llamadas al dia · les crearemso un panel dodne podran poner las bases de leads y la api de retell ai'

/** Formato real de la UI: pipes ASCII y a veces sin salto tras Ficha web */
const FLAT_ASCII = `┌ Grupo Planeta · | planeta.es · Medios, edición y educación (grupo multinacional) · | · | QUIÉNES SON · | Grupo Planeta es un grupo multinacional presente en 25 países · | · | QUÉ OFRECEN · | · La nostra activitat · | · Llibres · | · | EN LA WEB SE VE · | · Formulario de contacto · | · └ Ficha web · ${BRIEF}`

/** Sin marcador Ficha web (peor caso) */
const FLAT_NO_CLOSE = `┌ Grupo Planeta · | planeta.es · Medios · | · | QUIÉNES SON · | Grupo Planeta es un grupo · | · | QUÉ OFRECEN · | · Llibres · | · | EN LA WEB SE VE · | · Formulario · | · ${BRIEF}`

describe('format-project-summary', () => {
  it('sanitizeProjectTitle rechaza ficha como título', () => {
    expect(sanitizeProjectTitle(FLAT_ASCII, 'Grupo Planeta')).toBe('Grupo Planeta')
    expect(sanitizeProjectTitle(FLAT_ASCII)).toBeNull()
  })

  it('strip con pipes ASCII corta en Ficha web', () => {
    const out = stripResearchFiches(FLAT_ASCII)
    expect(out).not.toMatch(/QUIÉNES SON|QUIENES SON/i)
    expect(out).toMatch(/outbound|llamadas|retell|panel/i)
  })

  it('strip sin Ficha web arranca en basicamente', () => {
    const out = stripResearchFiches(FLAT_NO_CLOSE)
    expect(out.toLowerCase()).toContain('basicamente')
    expect(out).not.toMatch(/QUIÉNES SON/i)
  })

  it('pick nunca devuelve la ficha', () => {
    const out = pickProjectSummaryText({
      definition: FLAT_ASCII,
      context: FLAT_ASCII,
    })
    expect(out).not.toMatch(/QUIÉNES|Ficha web|planeta\.es|┌|\|/i)
    expect(out).toMatch(/1000|llamadas|retell|panel/i)
  })

  it('detecta ficha aplanada', () => {
    expect(looksLikeResearchFiche(FLAT_ASCII)).toBe(true)
    expect(extractProjectBrief(FLAT_ASCII)).not.toMatch(/QUIÉNES/i)
  })
})
