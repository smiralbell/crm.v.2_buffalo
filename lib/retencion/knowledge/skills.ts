/**
 * Skills del agente de auditoría de retención.
 * Cada skill = protocolo + tools asociadas.
 */

import {
  KNOWLEDGE_SECTIONS,
  KNOWLEDGE_STRUCTURE_RULES,
  ROI_INTERVIEW_CHECKLIST,
} from './template'

export type RetentionSkillId =
  | 'ingest_crm'
  | 'structure_knowledge'
  | 'explore_client_db'
  | 'interview'
  | 'roi_baseline'
  | 'persist_context'
  | 'validate_checklist'

export const RETENTION_SKILLS: Record<
  RetentionSkillId,
  { name: string; when: string; how: string; tools: string[] }
> = {
  ingest_crm: {
    name: 'Ingestar CRM',
    when: 'Al empezar la auditoría o cuando pidan refrescar conocimiento del proyecto.',
    how: `1) Llama load_crm_knowledge (source=all) para obtener el seed estructurado.
2) Si el contexto guardado está vacío o es más pobre que el seed, llama seed_knowledge_from_crm (overwrite=false fusiona; true reemplaza).
3) Revisa secciones 1–7 y 9; marca huecos como "Pendiente".
4) No inventes datos que no vengan del CRM o del usuario.`,
    tools: ['load_crm_knowledge', 'seed_knowledge_from_crm', 'merge_knowledge_section'],
  },
  structure_knowledge: {
    name: 'Estructurar contexto',
    when: 'Siempre que guardes o actualices el documento de contexto.',
    how: `Respeta la plantilla canónica de secciones.
${KNOWLEDGE_STRUCTURE_RULES}
Usa merge_knowledge_section para actualizar una sola sección sin pisar el resto.
Usa save_knowledge solo para reescrituras completas coherentes.`,
    tools: ['merge_knowledge_section', 'save_knowledge'],
  },
  explore_client_db: {
    name: 'Explorar Postgres cliente',
    when: 'Hay URL conectada o el dominio requiere datos vivos.',
    how: `list_tables → describe_table de las tablas de negocio → run_select con LIMIT bajo.
Documenta hallazgos en la sección "## 8. Datos y schema del cliente" (merge_knowledge_section).
También actualiza schema_summary en save_knowledge si procede.
Si no hay DB: marca [[CONNECT_POSTGRES]].
Si hay volúmenes reales (llamadas, chats, citas…), úsalos para contrastar el baseline de horas de la sección 11.
Cuando hayas mapeado tablas/columnas clave, update_audit_checklist con db_access.ok=true.`,
    tools: [
      'list_tables',
      'describe_table',
      'run_select',
      'merge_knowledge_section',
      'save_knowledge',
      'update_audit_checklist',
    ],
  },
  interview: {
    name: 'Entrevista operativa',
    when: 'Tras ingerir CRM; para rellenar huecos (SLAs, tonos, flujos, éxito).',
    how: `Haz preguntas concretas basadas en lo que YA sabes del CRM (tareas abiertas, tickets, scope).
No repitas lo que ya está en el seed.
Prioriza sección 10 (operativa) y matices de producto/flujos.
Cuando el usuario responda, fusiona en la sección adecuada.`,
    tools: ['merge_knowledge_section', 'save_knowledge'],
  },
  roi_baseline: {
    name: 'Baseline manual y ROI',
    when: 'Obligatoria en toda auditoría, tras el seed CRM (antes o en paralelo a la entrevista operativa).',
    how: `Objetivo: cuantificar qué perdía el cliente haciéndolo manual y cuánto ahorra con Buffalo.

${ROI_INTERVIEW_CHECKLIST}

Flujo:
1) Pregunta tiempo, dinero y recursos (no todo de golpe: 2–4 preguntas claras por turno).
2) Guarda respuestas en merge_knowledge_section section_id=baseline_manual.
3) Con mensualidad Buffalo (sección comercial / load_crm_knowledge source=comercial), calcula y guarda section_id=roi_ahorro con la cuenta visible.
4) Si faltan datos críticos (horas o €/hora), no marques mark_ready=true solo por CRM: deja pendientes explícitos.
5) Si el usuario da rangos, usa el punto medio y anota el rango.
6) Si 11–12 están completas, update_audit_checklist con roi_resolved.ok=true.`,
    tools: [
      'load_crm_knowledge',
      'merge_knowledge_section',
      'save_knowledge',
      'update_audit_checklist',
    ],
  },
  persist_context: {
    name: 'Persistir contexto',
    when: 'Tras un bloque útil de aprendizaje (CRM, entrevista, ROI o DB).',
    how: `Guarda pronto. mark_ready=true cuando el documento ya sea útil para informes:
- Debe incluir al menos un intento serio de secciones 11 y 12 (aunque queden pendientes parciales).
Tras validar, llama update_audit_checklist para poner en verde las tarjetas (db_access, roi_resolved, project_understood) SOLO si están realmente OK.
Claridad > exhaustividad.`,
    tools: ['save_knowledge', 'merge_knowledge_section', 'update_audit_checklist'],
  },
  validate_checklist: {
    name: 'Validar tarjetas',
    when: 'Cuando el usuario pida validar, o al cerrar un bloque de DB / ROI / comprensión del proyecto.',
    how: `Comprueba y marca con update_audit_checklist:
1) db_access: ¿hay URL, listaste tablas, entendiste columnas clave y actualizaste schema_summary / sección 8?
2) roi_resolved: ¿secciones 11–12 con cifras o estimaciones claras (tiempo, €, personas, ahorro/ROI)?
3) project_understood: ¿producto, flujos, operativa y riesgos cubiertos de forma útil?
Si algo falla, ok=false con detail concreto de qué falta. Si está bien, ok=true y detail corto.`,
    tools: ['load_crm_knowledge', 'list_tables', 'describe_table', 'update_audit_checklist', 'merge_knowledge_section'],
  },
}

export function buildSkillsPromptBlock(): string {
  const lines = Object.values(RETENTION_SKILLS).map(
    (s) =>
      `### Skill: ${s.name}\nCuándo: ${s.when}\nCómo:\n${s.how}\nTools: ${s.tools.join(', ')}`
  )
  return `## SKILLS DEL AGENTE
Orden típico: ingest_crm → roi_baseline (+ interview) → explore_client_db → validate_checklist → structure_knowledge → persist_context.

Prioridad de valor: sin secciones 11–12 (baseline + ROI) la auditoría está incompleta.
Las tarjetas verdes (DB / ROI / proyecto) deben actualizarse con update_audit_checklist cuando corresponda.

${lines.join('\n\n')}

## PLANTILLA DE SECCIONES
${KNOWLEDGE_SECTIONS.map((s) => `- ${s.title}: ${s.purpose}`).join('\n')}

${KNOWLEDGE_STRUCTURE_RULES}`
}

/** Definiciones OpenRouter tools para conocimiento CRM. */
export const KNOWLEDGE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'load_crm_knowledge',
      description:
        'Carga conocimiento del CRM Buffalo. source=all|identidad|producto|comercial|tecnico|onboarding_dev|tareas|soporte|metricas|operativa|baseline_manual|roi_ahorro|fuentes.',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'Sección o all',
          },
          as_markdown: {
            type: 'boolean',
            description: 'Si true, devuelve el seed markdown completo (solo con source=all).',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'seed_knowledge_from_crm',
      description:
        'Genera el documento de contexto desde el CRM y lo guarda. overwrite=false: solo si el contexto actual está vacío o es muy corto. overwrite=true: reemplaza.',
      parameters: {
        type: 'object',
        properties: {
          overwrite: { type: 'boolean' },
          mark_ready: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'merge_knowledge_section',
      description:
        'Actualiza UNA sección del contexto (ids: identidad, producto, comercial, tecnico, onboarding_dev, tareas, soporte, datos, metricas, operativa, baseline_manual, roi_ahorro, fuentes).',
      parameters: {
        type: 'object',
        properties: {
          section_id: { type: 'string' },
          content: {
            type: 'string',
            description: 'Markdown del cuerpo de la sección (sin el ## título)',
          },
          mark_ready: { type: 'boolean' },
        },
        required: ['section_id', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_audit_checklist',
      description:
        'Marca las tarjetas de validación del contexto: db_access (Postgres+columnas), roi_resolved (tiempo/dinero/recursos+ROI), project_understood (producto/flujos). Pon ok=true SOLO cuando esté realmente validado; incluye detail breve.',
      parameters: {
        type: 'object',
        properties: {
          db_access: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              detail: { type: 'string' },
            },
            required: ['ok'],
          },
          roi_resolved: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              detail: { type: 'string' },
            },
            required: ['ok'],
          },
          project_understood: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              detail: { type: 'string' },
            },
            required: ['ok'],
          },
        },
      },
    },
  },
]
