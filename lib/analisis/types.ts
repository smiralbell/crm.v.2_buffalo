export type CrmAiMetric = {
  nombre: string
  valor: string
  interpretacion: string
  fuente?: string
}

export type CrmAiAlert = {
  severidad: 'critica' | 'alta' | 'media' | 'baja'
  titulo: string
  detalle: string
  accion: string
}

export type CrmAiSection = {
  titulo: string
  hallazgos: string[]
  metricas?: CrmAiMetric[]
}

export type CrmCompanyAiSummary = {
  resumen_ejecutivo: string
  salud_empresa_0_100: number
  wins: string[]
  riesgos: string[]
  alertas: CrmAiAlert[]
  acciones_esta_semana: string[]
  oportunidades: string[]
  secciones: CrmAiSection[]
  metricas_clave: CrmAiMetric[]
  path_crecimiento: string
  huecos_dato: string[]
}

export type CrmCompanyAiAnalysisRow = {
  id: string
  summary: CrmCompanyAiSummary
  model: string
  created_at: string
}
