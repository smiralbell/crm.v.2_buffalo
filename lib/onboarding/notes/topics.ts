/**
 * Guion comercial Buffalo — portado del prototipo notas-preview (TOPICS + TRIGGERS).
 * Se inyecta al LLM del copiloto y alimenta el fallback heurístico.
 */

export type NoteTopic = {
  id: string
  label: string
  kw: string[]
  q: string[]
}

export type NoteTrigger = {
  re: RegExp
  tag: string
  q: string
}

export const TOPICS: NoteTopic[] = [
  {
    id: 'proceso',
    label: 'Proceso actual',
    kw: [
      'proceso',
      'ahora',
      'actualmente',
      'hoy',
      'manual',
      'flujo',
      'gestion',
      'atienden',
      'atiende',
      'hacen',
    ],
    q: [
      '¿Cómo se gestiona hoy exactamente, paso a paso, desde que entra la consulta hasta que se cierra?',
      '¿Qué parte del proceso os come más tiempo y no aporta valor?',
    ],
  },
  {
    id: 'volumen',
    label: 'Volumen',
    kw: [
      'volumen',
      'consultas',
      'llamadas',
      'mensajes',
      'al mes',
      'al dia',
      'diarias',
      'mensuales',
      'cuantos',
      '%',
      'por ciento',
    ],
    q: [
      '¿Qué volumen manejáis al mes y cómo se reparte entre canales?',
      '¿Ese número es la media o el pico? ¿En qué franjas se concentra?',
    ],
  },
  {
    id: 'canales',
    label: 'Canales',
    kw: [
      'whatsapp',
      'telefono',
      'teléfono',
      'email',
      'correo',
      'web',
      'chat',
      'instagram',
      'formulario',
      'presencial',
    ],
    q: [
      '¿Por qué canales os llegan las consultas y cuál es el más problemático?',
      '¿Hay algún canal que queráis potenciar o abandonar?',
    ],
  },
  {
    id: 'herramientas',
    label: 'Herramientas',
    kw: [
      'crm',
      'erp',
      'excel',
      'hoja',
      'software',
      'herramienta',
      'plataforma',
      'agenda',
      'calendario',
      'sistema',
      'doctoralia',
      'hubspot',
      'holded',
      'odoo',
      'sage',
    ],
    q: [
      '¿Qué herramientas usáis hoy y cuáles NO se pueden tocar?',
      '¿Esa herramienta tiene API o alguna forma de integración?',
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo',
    kw: [
      'equipo',
      'personas',
      'empleados',
      'recepcion',
      'recepción',
      'comercial',
      'staff',
      'plantilla',
      'gente',
      'trabajadores',
    ],
    q: [
      '¿Quién hace este trabajo hoy y cuántas horas le dedica?',
      '¿Cómo va a afectar esto a su día a día? ¿Hay resistencia?',
    ],
  },
  {
    id: 'dolor',
    label: 'Dolor real',
    kw: [
      'problema',
      'duele',
      'pierden',
      'perdemos',
      'cuello',
      'saturado',
      'no llegamos',
      'colapso',
      'estres',
      'estrés',
      'se quejan',
      'frustra',
    ],
    q: [
      'Si esto no se resuelve en 6 meses, ¿qué pasa?',
      '¿Cuánto os está costando el problema hoy, en dinero o en oportunidades perdidas?',
    ],
  },
  {
    id: 'conocimiento',
    label: 'Conocimiento',
    kw: [
      'documentacion',
      'documentación',
      'informacion',
      'información',
      'base de datos',
      'faq',
      'preguntas frecuentes',
      'manual',
      'protocolo',
      'catalogo',
      'catálogo',
      'precios',
      'tarifas',
    ],
    q: [
      '¿De dónde saca la información el agente? ¿Existe ya documentada o hay que crearla?',
      '¿Quién es el responsable de mantenerla actualizada?',
    ],
  },
  {
    id: 'escalado',
    label: 'Escalado a humano',
    kw: [
      'escalar',
      'escalado',
      'derivar',
      'pasar a',
      'humano',
      'persona',
      'agente humano',
      'transferir',
    ],
    q: [
      '¿En qué casos el agente debe parar y pasar a una persona?',
      '¿Qué necesita recibir esa persona para retomar la conversación sin perder contexto?',
    ],
  },
  {
    id: 'exito',
    label: 'Éxito / KPI',
    kw: [
      'objetivo',
      'exito',
      'éxito',
      'kpi',
      'medir',
      'metrica',
      'métrica',
      'resultado',
      'mejorar',
      'reducir',
      'aumentar',
    ],
    q: [
      '¿Cómo sabremos dentro de 3 meses que esto ha funcionado? Dame un número.',
      '¿Qué medís hoy y qué no podéis medir aunque queráis?',
    ],
  },
  {
    id: 'decision',
    label: 'Decisión',
    kw: [
      'decide',
      'decision',
      'decisión',
      'director',
      'gerente',
      'socio',
      'junta',
      'aprobar',
      'firma',
      'presupuesto interno',
    ],
    q: [
      '¿Quién más tiene que dar el visto bueno además de ti?',
      '¿Qué necesita ver esa persona para decir que sí?',
    ],
  },
  {
    id: 'presupuesto',
    label: 'Presupuesto',
    kw: [
      'presupuesto',
      'coste',
      'precio',
      'invertir',
      'inversion',
      'inversión',
      '€',
      'euros',
      'pagar',
      'cuanto cuesta',
    ],
    q: [
      '¿Tenéis una horquilla de inversión en mente para esto?',
      '¿Preferís implantación + cuota mensual, o un modelo distinto?',
    ],
  },
  {
    id: 'plazos',
    label: 'Plazos',
    kw: [
      'plazo',
      'cuando',
      'cuándo',
      'fecha',
      'urgente',
      'antes de',
      'mes que viene',
      'temporada',
      'deadline',
    ],
    q: [
      '¿Para cuándo lo necesitáis funcionando y por qué esa fecha?',
      '¿Hay alguna temporada alta que condicione el arranque?',
    ],
  },
  {
    id: 'datos',
    label: 'Datos y RGPD',
    kw: [
      'rgpd',
      'datos personales',
      'privacidad',
      'legal',
      'proteccion',
      'protección',
      'confidencial',
      'historial',
      'sanitario',
    ],
    q: [
      '¿Se van a tratar datos personales o sensibles? ¿Quién valida el encaje legal?',
      '¿Hay algún dato que no pueda salir de vuestros sistemas bajo ningún concepto?',
    ],
  },
  {
    id: 'riesgos',
    label: 'Miedos',
    kw: [
      'miedo',
      'riesgo',
      'preocupa',
      'no queremos',
      'peligro',
      'fallar',
      'mal',
      'desconfia',
      'desconfía',
    ],
    q: [
      '¿Qué es lo que más te preocupa de meter IA en este proceso?',
      '¿Qué tendría que pasar para que consideres esto un fracaso?',
    ],
  },
]

export const TRIGGERS: NoteTrigger[] = [
  {
    re: /\b(\d{2,5})\b/,
    tag: 'Cifra',
    q: 'Has apuntado una cifra: ¿de qué periodo es y de dónde sale ese dato?',
  },
  {
    re: /excel|hoja de c|google sheet/i,
    tag: 'Herramienta',
    q: 'Si hoy va por Excel: ¿quién lo mantiene y cuántas versiones distintas circulan?',
  },
  {
    re: /whatsapp/i,
    tag: 'Canal',
    q: '¿El WhatsApp es número personal, de empresa o API oficial? Cambia mucho la implantación.',
  },
  {
    re: /no quiere|no quieren|no vamos a|se niega/i,
    tag: 'Restricción',
    q: 'Has anotado una restricción: ¿es innegociable o negociable si se demuestra el valor?',
  },
  {
    re: /competencia|competidor|otra agencia|otro proveedor/i,
    tag: 'Competencia',
    q: '¿Están hablando con alguien más? ¿Qué les ha gustado y qué no de esa opción?',
  },
  {
    re: /prueba|piloto|test|demo/i,
    tag: 'Piloto',
    q: '¿Qué alcance tendría un piloto y qué haría falta para darlo por válido?',
  },
  {
    re: /integrar|integracion|integración|api/i,
    tag: 'Integración',
    q: '¿Quién nos da los accesos técnicos y en cuánto tiempo?',
  },
]

export function normNoteText(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export type CopilotQuestion = {
  tema: string
  tipo: 'hueco' | 'profundizar' | 'web' | 'contexto'
  texto: string
  porque: string
}

export type HeuristicAnalyseResult = {
  cubiertos: string[]
  preguntas: CopilotQuestion[]
}

/** Motor heurístico del prototipo (fallback sin LLM). */
export function analyseNotesHeuristic(input: {
  notesText: string
  researchGanchos?: string[]
}): HeuristicAnalyseResult {
  const all = normNoteText(input.notesText)
  const covered = new Set<string>()
  for (const t of TOPICS) {
    let hits = 0
    for (const k of t.kw) if (all.includes(normNoteText(k))) hits++
    if (hits >= 1) covered.add(t.id)
  }

  const out: CopilotQuestion[] = []
  for (const g of input.researchGanchos || []) {
    out.push({
      tema: 'Web',
      tipo: 'web',
      texto: g,
      porque: 'Sacado de la investigación de su web',
    })
  }

  for (const t of TOPICS.filter((x) => !covered.has(x.id))) {
    out.push({
      tema: t.label,
      tipo: 'hueco',
      texto: t.q[0],
      porque: `Aún no has tocado «${t.label}»`,
    })
  }

  for (const tr of TRIGGERS) {
    if (tr.re.test(input.notesText)) {
      out.push({
        tema: tr.tag,
        tipo: 'contexto',
        texto: tr.q,
        porque: `Disparador: ${tr.tag}`,
      })
    }
  }

  for (const t of TOPICS.filter((x) => covered.has(x.id) && all.length < 1800)) {
    if (t.q[1]) {
      out.push({
        tema: t.label,
        tipo: 'profundizar',
        texto: t.q[1],
        porque: `Ya tocaste «${t.label}», pero conviene profundizar`,
      })
    }
  }

  return {
    cubiertos: Array.from(covered),
    preguntas: out.slice(0, 12),
  }
}

export function formatTopicsForPrompt(): string {
  return TOPICS.map(
    (t) => `- ${t.id} (${t.label}): ejemplos → ${t.q.join(' | ')}`
  ).join('\n')
}
