/**
 * Skills del editor de propuestas: protocolos de intención + ops preferidas.
 * No son subagentes: se inyectan en el system prompt del chat.
 */

export type ProposalSkillId =
  | 'cover'
  | 'acceptance'
  | 'section_edit'
  | 'layout'
  | 'chart'
  | 'design'
  | 'language'
  | 'regenerate'
  | 'general'

export type ProposalSkill = {
  id: ProposalSkillId
  name: string
  when: string
  how: string
  preferredOps: string[]
}

export const PROPOSAL_SKILLS: Record<ProposalSkillId, ProposalSkill> = {
  cover: {
    id: 'cover',
    name: 'Portada',
    when: 'Portada, subtítulo, descripción de portada, título principal.',
    how: `Usa set_title / set_subtitle / shorten_cover.
El subtítulo de portada debe ser 1–2 frases (≤ ~220 caracteres) salvo que pidan alargarlo a propósito (entonces set_subtitle con el texto pedido).
NUNCA uses replace_doc para solo tocar la portada.`,
    preferredOps: ['set_title', 'set_subtitle', 'shorten_cover'],
  },
  acceptance: {
    id: 'acceptance',
    name: 'Aceptación y firmas',
    when: 'Firmas, aceptación, bloques de firma, tablas de cliente/proveedor al final.',
    how: `Preferible ensure_signatures (reescribe ## Aceptación con párrafo corto + :::signatures).
Si piden cambiar solo el nombre del cliente en firmas: ensure_signatures (usa metadatos) o replace_section de Aceptación.
NUNCA dejes tablas markdown para firmas.`,
    preferredOps: ['ensure_signatures', 'replace_section'],
  },
  section_edit: {
    id: 'section_edit',
    name: 'Edición de sección',
    when: 'Punto N, sección N, ampliar/acortar/reescribir un apartado, pegar texto a cambiar.',
    how: `Usa replace_section / append_to_section / replace_text / insert_section / delete_section.
"Punto N" = índice del MAPA DE SECCIONES.
Si pegan un fragmento literal → replace_text con match = fragmento.
Al ampliar UN punto: 1–3 párrafos bien escritos, no regeneres el resto.
Si piden CADA punto / TODO el documento / el doble de contenido → expand_sections (fan-out).`,
    preferredOps: [
      'expand_sections',
      'replace_section',
      'append_to_section',
      'replace_text',
      'insert_section',
      'delete_section',
    ],
  },
  layout: {
    id: 'layout',
    name: 'Maquetación',
    when: 'Saltos de página o de línea, compactar, tema, entre puntos.',
    how: `POLARIDAD (obligatoria):
- PONER saltos entre puntos ("pon un salto", "separa los puntos", "cada punto en su página") →
  { "op":"ensure_section_pagebreaks" }
  (NO uses set_page_mode flow ni remove_pagebreaks).
- QUITAR saltos entre puntos ("borra/quita saltos", "sin salto", "puntos seguidos", "todo en una página") →
  { "op":"set_page_mode", "mode":"flow" } y { "op":"remove_pagebreaks" }.
- Compactar líneas en blanco (no páginas) → { "op":"compact_blank_lines" }.
- Un salto concreto antes del punto N → { "op":"add_pagebreak", "before_section": N }.
- Tema → set_theme.
NUNCA inviertas poner/quitar.`,
    preferredOps: [
      'ensure_section_pagebreaks',
      'set_page_mode',
      'remove_pagebreaks',
      'add_pagebreak',
      'compact_blank_lines',
      'set_theme',
    ],
  },
  chart: {
    id: 'chart',
    name: 'Gráficos',
    when: 'Gráfico, gráfica, chart, evolución visual, representar números, barras, donut, pie, comparar visualmente cifras, proyección, sin Buffalo vs con Buffalo.',
    how: `Usa las herramientas especializadas:
- set_chart_type({ section, type }) — cambia SOLO el type= de un :::chart existente (arregla "quiero temporal en vez de barras").
- insert_scenario_chart({ section, chartType, … }) — inserta proyección ilustrativa sin/con Buffalo con divergencia creciente y nota de hipótesis. replaceExisting=true sustituye :::chart/:::table previos.
Tipos: line/area (evolución), bar/barcompare (categorías), donut/pie (reparto).
CIFRAS REALES: solo del contexto/auditoría. NUNCA las inventes ni las presentes como históricas.
PROYECCIÓN ILUSTRATIVA (permitida): title con "Proyección ilustrativa" + nota de hipótesis bajo el gráfico.
Si piden "en vez de tabla un gráfico" → insert_scenario_chart con replaceExisting o set_chart_type si ya hay chart.`,
    preferredOps: [
      'set_chart_type',
      'insert_scenario_chart',
      'append_to_section',
      'replace_section',
    ],
  },
  design: {
    id: 'design',
    name: 'Diseño visual',
    when: 'Tabla bonita, burbuja, cards, callout, highlight, más visual, mejorar diseño, maquetar un bloque.',
    how: `Eres diseñador de la plantilla Buffalo. Sustituye markdown plano por bloques BRM visuales.
Usa replace_section o replace_text / append_to_section con:::table, :::cards, :::bubble, :::callout, :::highlight, :::kpi-grid, :::chart.
Tabla pedida o “sosa” → :::table{variant="compare"} (o pricing si es económica).
Gráfico / evolución numérica → :::chart (skill chart; no una tabla plana).
Burbuja / tarjeta / cards → :::bubble o :::cards{columns="2"} con ### por card.
“Mejora el diseño” → reescribe SOLO el bloque citado con componentes visuales; no toques el resto.
No uses tablas markdown planas ni listas feas si hay un bloque BRM mejor.`,
    preferredOps: ['replace_section', 'replace_text', 'append_to_section'],
  },
  language: {
    id: 'language',
    name: 'Idioma',
    when: 'Traducir / pasar a catalán / inglés / otro idioma todo el documento.',
    how: `Usa la herramienta replace_document con la propuesta COMPLETA traducida, manteniendo sintaxis BRM (#, ##, :::, pagebreaks, signatures).
No inventes secciones nuevas ni cifras.`,
    preferredOps: ['replace_document'],
  },
  regenerate: {
    id: 'regenerate',
    name: 'Regenerar',
    when: 'Reescribe todo, regenera, hazla de nuevo, como ACCIÓ, propuesta completa.',
    how: `Usa replace_document con una propuesta comercial completa multi-sección (estructura ACCIÓ).
Incluye pagebreaks y :::signatures al final.`,
    preferredOps: ['replace_document'],
  },
  general: {
    id: 'general',
    name: 'General',
    when: 'Cualquier otra petición o intención mixta.',
    how: `Elige la op mínima. Preferible replace_text o replace_section frente a replace_doc.
Si es ambiguo, aplica el cambio más pequeño y acláralo en note.`,
    preferredOps: ['replace_text', 'replace_section', 'append_to_section', 'set_subtitle'],
  },
}

/** Clasificador multi-intención: acumula todos los matches (sin return temprano). */
export function classifyProposalSkills(instruction: string): ProposalSkillId[] {
  const n = instruction
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const found: ProposalSkillId[] = []
  const add = (id: ProposalSkillId) => {
    if (!found.includes(id)) found.push(id)
  }

  // Orden de prioridad: regenerate > language > cover > acceptance > chart > design > layout > section_edit > general
  if (
    /reescribe todo|regenera|hazla de nuevo|como accio|propuesta completa|desde cero/.test(n)
  ) {
    add('regenerate')
  }
  if (
    /pasala a|traduce|en catalan|en ingles|en english|a catalan|a ingles|idioma/.test(n)
  ) {
    add('language')
  }
  if (
    /portada|subtitulo|subtitol|descripcion de la portada|titulo de la propuesta/.test(n) &&
    !/punto \d|seccion \d|apartado \d/.test(n)
  ) {
    add('cover')
  }
  if (/firma|aceptacion|acceptacio|signatures|signatura/.test(n)) {
    add('acceptance')
  }
  if (
    /\b(grafico|grafica|graficos|graficas|chart|charts)\b/.test(n) ||
    /evolucion visual|representa(lo|r)? visual|en (un )?grafico|diagrama de barras|barras compar|donut|pie chart/.test(
      n
    )
  ) {
    add('chart')
  }
  // "más tablas" en contexto de densificar todo → section_edit + design, no solo design
  const densifyAll =
    /(cada punto|todos los puntos|todo el documento|todas las secciones|el doble|mas contenido|llena todo|muy cortos)/.test(
      n
    )
  if (
    /tabla|burbuja|bubble|cards?|tarjetas?|callout|highlight|kpi|checklist|dise[nñ]o|visual|bonit|maqueta|estilo|comparativ|mas chulo|mas mono|sosa/.test(
      n
    )
  ) {
    add('design')
    if (densifyAll) add('section_edit')
  }
  if (
    /pagebreak|salto de pagina|salto entre|entre punto|tema (verde|claro|oscuro)|compacto|mas junto|todo seguido|puntos? seguidos|una (sola )?pagina|quita.{0,20}saltos|pon.{0,20}saltos/.test(
      n
    )
  ) {
    add('layout')
  }
  if (
    /punto \d|apartado \d|seccion \d|amplia|extiende|acorta|reescribe|anade|quita|cambia|desarrolla|densifica|mas parrafos|mas desglose/.test(
      n
    )
  ) {
    add('section_edit')
  }

  if (found.length === 0) add('general')
  return found
}

/** Wrapper compat: primera skill del array multi. */
export function classifyProposalSkill(instruction: string): ProposalSkillId {
  return classifyProposalSkills(instruction)[0] || 'general'
}

/**
 * Qué modelo necesita el conjunto de skills (heavy gana si alguna lo pide).
 */
export function proposalSkillsModelTier(skillIds: ProposalSkillId[]): 'fast' | 'heavy' {
  return skillIds.some((id) => proposalSkillModelTier(id) === 'heavy') ? 'heavy' : 'fast'
}

/**
 * Qué modelo necesita cada skill.
 *
 * `fast` SOLO para cambios estructurales donde el modelo elige una op determinista
 * y no redacta nada (saltos de página, tema, acortar portada, firmas).
 * Todo lo que implique ESCRIBIR PROSA va con el modelo bueno: es justo donde el
 * mini se quedaba corto («amplía el punto 4» devolvía una frase).
 * `general` → heavy a propósito: es el cajón de sastre de lo imprevisible.
 */
export function proposalSkillModelTier(skillId: ProposalSkillId): 'fast' | 'heavy' {
  return skillId === 'layout' || skillId === 'cover' || skillId === 'acceptance'
    ? 'fast'
    : 'heavy'
}

/** Bloque de skill para inyectar en el system prompt (el catálogo va siempre vía buildProposalEditSystem). */
export function formatSkillForPrompt(skillId: ProposalSkillId): string {
  const s = PROPOSAL_SKILLS[skillId]
  return `════════════════════════
SKILL ACTIVA: ${s.name} (${s.id})
════════════════════════
Cuándo: ${s.when}
Cómo: ${s.how}
Ops preferidas: ${s.preferredOps.join(', ')}`
}

/** Concatena varias skills (catálogo NO se duplica: va en buildProposalEditSystem). */
export function formatSkillsForPrompt(skillIds: ProposalSkillId[]): string {
  const ids = skillIds.length ? skillIds : (['general'] as ProposalSkillId[])
  return ids.map((id) => formatSkillForPrompt(id)).join('\n\n')
}
