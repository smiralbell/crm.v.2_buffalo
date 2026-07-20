import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { query } from '@/lib/db'
import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import { buildCrmCompanySnapshot, type CrmCompanySnapshot } from '@/lib/analisis/snapshot'
import type { CrmCompanyAiAnalysisRow, CrmCompanyAiSummary } from '@/lib/analisis/types'
import { CRM_ONTOLOGY_FALLBACK } from '@/lib/analisis/ontology-fallback'

const SYSTEM = `Eres el analista estratégico senior de Buffalo AI (agencia de agentes IA: voz, chat, dashboards; modelo setup + mensualidad/MRR).

Te dan:
1) Extracto de la ontología oficial del CRM (guía).
2) Un SNAPSHOT JSON con números reales de PostgreSQL.

Tu trabajo: un análisis ESPECTACULAR, accionable y cuantitativo para el CEO.

Responde SOLO con JSON válido (sin markdown), en español, estructura EXACTA:
{
  "resumen_ejecutivo": "6-10 frases densas, con cifras del snapshot",
  "salud_empresa_0_100": 0-100,
  "wins": ["máx 5, con datos"],
  "riesgos": ["máx 5, con datos"],
  "alertas": [
    {
      "severidad": "critica|alta|media|baja",
      "titulo": string,
      "detalle": string,
      "accion": string
    }
  ],
  "acciones_esta_semana": ["máx 7, verbos en infinitivo, ultra concretas"],
  "oportunidades": ["máx 5"],
  "secciones": [
    {
      "titulo": "Comercial / Embudo",
      "hallazgos": ["..."],
      "metricas": [{ "nombre": "", "valor": "", "interpretacion": "", "fuente": "tabla.columna" }]
    },
    {
      "titulo": "Proyectos y producción",
      "hallazgos": ["..."],
      "metricas": []
    },
    {
      "titulo": "Retención y MRR",
      "hallazgos": ["..."],
      "metricas": []
    },
    {
      "titulo": "Finanzas (facturado vs caja)",
      "hallazgos": ["..."],
      "metricas": []
    },
    {
      "titulo": "Marketing y cold calling",
      "hallazgos": ["..."],
      "metricas": []
    },
    {
      "titulo": "Operaciones (tareas y tickets)",
      "hallazgos": ["..."],
      "metricas": []
    }
  ],
  "metricas_clave": [
    { "nombre": string, "valor": string, "interpretacion": string, "fuente": string }
  ],
  "path_crecimiento": "3-5 frases hacia el objetivo anual usando palancas reales del snapshot",
  "huecos_dato": ["qué falta medir o conectar"]
}

REGLAS DURAS:
- Usa SOLO números del snapshot. No inventes.
- Respeta la ontología: es_buffalo + config lead = cartera abierta; status=active = producción; setup ≠ MRR; facturas ≠ cobros banco.
- Cada métrica clave debe citar fuente (tabla.columna o path del snapshot).
- Si un bloque del snapshot viene vacío/cero, dilo en huecos_dato.
- Tono directo, sin fluff motivacional.`

async function loadGuideExcerpt(): Promise<string> {
  try {
    const full = await readFile(
      path.join(process.cwd(), 'docs', 'CRM_GUIA_ANALISIS_IA.md'),
      'utf8'
    )
    // Suficiente para reglas + enums + recetas; el snapshot lleva los números
    return full.slice(0, 14000)
  } catch {
    return CRM_ONTOLOGY_FALLBACK
  }
}

function normalizeSummary(raw: unknown): CrmCompanyAiSummary {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const asStrArr = (v: unknown, max: number) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string').slice(0, max)
      : []

  const alertas = Array.isArray(o.alertas)
    ? o.alertas.slice(0, 8).map((a) => {
        const x = a as Record<string, unknown>
        const sev = String(x.severidad || 'media')
        const severidad =
          sev === 'critica' || sev === 'alta' || sev === 'media' || sev === 'baja'
            ? sev
            : 'media'
        return {
          severidad: severidad as CrmCompanyAiSummary['alertas'][0]['severidad'],
          titulo: String(x.titulo || 'Alerta'),
          detalle: String(x.detalle || ''),
          accion: String(x.accion || ''),
        }
      })
    : []

  const metricas = (v: unknown) =>
    Array.isArray(v)
      ? v.slice(0, 12).map((m) => {
          const x = m as Record<string, unknown>
          return {
            nombre: String(x.nombre || ''),
            valor: String(x.valor || ''),
            interpretacion: String(x.interpretacion || ''),
            fuente: x.fuente ? String(x.fuente) : undefined,
          }
        })
      : []

  const secciones = Array.isArray(o.secciones)
    ? o.secciones.slice(0, 8).map((s) => {
        const x = s as Record<string, unknown>
        return {
          titulo: String(x.titulo || 'Sección'),
          hallazgos: asStrArr(x.hallazgos, 8),
          metricas: metricas(x.metricas),
        }
      })
    : []

  const health = Number(o.salud_empresa_0_100)
  return {
    resumen_ejecutivo: String(o.resumen_ejecutivo || 'Sin resumen'),
    salud_empresa_0_100: Number.isFinite(health)
      ? Math.max(0, Math.min(100, Math.round(health)))
      : 50,
    wins: asStrArr(o.wins, 5),
    riesgos: asStrArr(o.riesgos, 5),
    alertas,
    acciones_esta_semana: asStrArr(o.acciones_esta_semana, 7),
    oportunidades: asStrArr(o.oportunidades, 5),
    secciones,
    metricas_clave: metricas(o.metricas_clave),
    path_crecimiento: String(o.path_crecimiento || ''),
    huecos_dato: asStrArr(o.huecos_dato, 8),
  }
}

export async function generateCrmCompanyAiAnalysis(): Promise<{
  summary: CrmCompanyAiSummary
  model: string
  snapshot: CrmCompanySnapshot
}> {
  const [snapshot, guide] = await Promise.all([
    buildCrmCompanySnapshot(),
    loadGuideExcerpt(),
  ])

  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          '=== GUÍA / ONTOLOGÍA (extracto) ===',
          guide,
          '',
          '=== SNAPSHOT CRM (números reales) ===',
          JSON.stringify(snapshot, null, 2),
          '',
          'Genera ahora el JSON del análisis completo.',
        ].join('\n'),
      },
    ],
    { temperature: 0.35 }
  )

  let summary: CrmCompanyAiSummary
  try {
    summary = normalizeSummary(parseJsonFromModelOutput(raw))
  } catch {
    throw new Error('La IA no devolvió JSON válido. Prueba de nuevo o ajusta OPENROUTER_MODEL.')
  }

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  return { summary, model, snapshot }
}

export async function saveCrmCompanyAiAnalysis(
  summary: CrmCompanyAiSummary,
  model: string,
  snapshot: CrmCompanySnapshot
): Promise<string> {
  const id = randomUUID()
  await query(
    `INSERT INTO crm_company_ai_analyses (id, summary_json, snapshot_json, model)
     VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
    [id, JSON.stringify(summary), JSON.stringify(snapshot), model]
  )
  return id
}

export async function ensureCrmAiAnalysesTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS crm_company_ai_analyses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      summary_json JSONB NOT NULL,
      snapshot_json JSONB,
      model TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function getLatestCrmCompanyAiAnalysis(): Promise<CrmCompanyAiAnalysisRow | null> {
  try {
    const result = await query<{
      id: string
      summary_json: CrmCompanyAiSummary
      model: string
      created_at: Date
    }>(
      `SELECT id, summary_json, model, created_at
       FROM crm_company_ai_analyses
       ORDER BY created_at DESC
       LIMIT 1`
    )
    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      summary: row.summary_json,
      model: row.model,
      created_at: row.created_at.toISOString(),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('crm_company_ai_analyses') || msg.includes('does not exist')) {
      return null
    }
    throw err
  }
}
