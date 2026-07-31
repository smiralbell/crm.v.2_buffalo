/**
 * Skills del editor de propuestas: protocolos de intención + ops preferidas.
 * No son subagentes: se inyectan en el system prompt del chat.
 */

import { PROPOSAL_DESIGN_CATALOG } from '@/lib/onboarding/proposal-design-catalog'

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
Al ampliar: 1–3 párrafos bien escritos, no regeneres el resto del documento.`,
    preferredOps: [
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
    when: 'Gráfico, gráfica, chart, evolución visual, representar números, barras, donut, pie, comparar visualmente cifras.',
    how: `Inserta un bloque :::chart{type="..." title="..."} con tabla GFM dentro (col1 = categoría, resto = series).
Usa replace_section / append_to_section / insert_section — NUNCA en la portada.
Tipos: line/area (evolución), bar/barcompare (categorías), donut/pie (reparto).
Cifras SOLO del contexto, metadatos o auditoría. Si no hay datos reales, usa valores de ejemplo
con title o nota "Ilustrativo" — NUNCA los presentes como reales.
No inventes ROI/payback: si piden economía sin cifras, dilo en note y usa "A definir" o ilustrativo.`,
    preferredOps: ['append_to_section', 'replace_section', 'insert_section'],
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
    how: `Usa replace_doc con la propuesta COMPLETA traducida, manteniendo sintaxis BRM (#, ##, :::, pagebreaks, signatures).
No inventes secciones nuevas ni cifras.`,
    preferredOps: ['replace_doc'],
  },
  regenerate: {
    id: 'regenerate',
    name: 'Regenerar',
    when: 'Reescribe todo, regenera, hazla de nuevo, como ACCIÓ, propuesta completa.',
    how: `Usa replace_doc con una propuesta comercial completa multi-sección (estructura ACCIÓ).
Incluye pagebreaks y :::signatures al final.`,
    preferredOps: ['replace_doc'],
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

/** Clasificador por keywords (sin llamada extra a la IA). */
export function classifyProposalSkill(instruction: string): ProposalSkillId {
  const n = instruction
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (
    /reescribe todo|regenera|hazla de nuevo|como accio|propuesta completa|desde cero/.test(n)
  ) {
    return 'regenerate'
  }
  if (
    /pasala a|traduce|en catalan|en ingles|en english|a catalan|a ingles|idioma/.test(n)
  ) {
    return 'language'
  }
  if (
    /portada|subtitulo|subtitol|descripcion de la portada|titulo de la propuesta/.test(n) &&
    !/punto \d|seccion \d|apartado \d/.test(n) &&
    !/tabla|burbuja|card|dise[nñ]o|callout|highlight/.test(n)
  ) {
    return 'cover'
  }
  if (/firma|aceptacion|acceptacio|signatures|signatura/.test(n) && !/tabla|burbuja|dise[nñ]o/.test(n)) {
    return 'acceptance'
  }
  // Gráficos antes que design genérico (solape con "visual" / "comparativa")
  if (
    /\b(grafico|grafica|graficos|graficas|chart|charts)\b/.test(n) ||
    /evolucion visual|representa(lo|r)? visual|en (un )?grafico|diagrama de barras|barras compar|donut|pie chart/.test(
      n
    )
  ) {
    return 'chart'
  }
  // Diseño visual antes que section_edit genérico
  if (
    /tabla|burbuja|bubble|cards?|tarjetas?|callout|highlight|kpi|checklist|dise[nñ]o|visual|bonit|maqueta|estilo|comparativ|mas chulo|mas mono|sosa/.test(
      n
    )
  ) {
    return 'design'
  }
  if (
    /pagebreak|salto de pagina|salto entre|entre punto|tema (verde|claro|oscuro)|compacto|mas junto|todo seguido|puntos? seguidos|una (sola )?pagina/.test(
      n
    )
  ) {
    return 'layout'
  }
  if (/punto \d|apartado \d|seccion \d|amplia|acorta|reescribe|anade|quita|cambia/.test(n)) {
    return 'section_edit'
  }
  return 'general'
}

/** Bloque de skill para inyectar en el system prompt. */
export function formatSkillForPrompt(skillId: ProposalSkillId): string {
  const s = PROPOSAL_SKILLS[skillId]
  const extra =
    skillId === 'design' || skillId === 'chart' ? `\n\n${PROPOSAL_DESIGN_CATALOG}` : ''
  return `════════════════════════
SKILL ACTIVA: ${s.name} (${s.id})
════════════════════════
Cuándo: ${s.when}
Cómo: ${s.how}
Ops preferidas: ${s.preferredOps.join(', ')}${extra}`
}
