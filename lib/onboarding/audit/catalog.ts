import type {
  AuditAreaId,
  AuditImportance,
  AuditMode,
  AuditProjectType,
  AuditStructured,
  CurrentQuestion,
} from './types'
import { AUDIT_AREAS } from './types'
import type { AuditBlockId } from './types'

export type CatalogQuestion = {
  field_key: string
  question: string
  why: string
  area: AuditAreaId
  importance: AuditImportance
  expected_type: 'text' | 'number' | 'list' | 'boolean'
  blocks_budget: boolean
  blocks_dev: boolean
  modes: AuditMode[]
  project_types?: AuditProjectType[] // vacío = todas
  /** Bloque de navegación (15 bloques) */
  block?: AuditBlockId
  /** Señales de texto que hacen relevante un follow-up de este campo */
  triggers?: string[]
  /** field_keys que deberían existir antes de preguntar esto */
  requires?: string[]
  /** No usar este campo para empujar a solución prematura */
  forbids_early_solution?: boolean
}

/** Preguntas ancla Buffalo. Follow-ups dinámicos en followups.ts / IA. */
export const BASE_QUESTIONS: CatalogQuestion[] = [
  // —— Cliente ——
  {
    field_key: 'business.company_summary',
    question: '¿A qué se dedica la empresa y quién es el interlocutor en esta reunión?',
    why: 'Contexto comercial y tono de la propuesta',
    area: 'negocio',
    block: 'cliente',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['descubrimiento', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  {
    field_key: 'business.main_goal',
    question: '¿Qué queréis conseguir con este proyecto en los próximos 3–6 meses?',
    why: 'Objetivo que ancla alcance y éxito',
    area: 'negocio',
    block: 'cliente',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'funcional', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  {
    field_key: 'business.ideal_customer',
    question: '¿Quién es vuestro cliente ideal y cómo conseguís hoy nuevos clientes?',
    why: 'Encaje comercial y canales de adquisición',
    area: 'negocio',
    block: 'cliente',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['descubrimiento', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  {
    field_key: 'business.interlocutor_role',
    question: '¿Cuál es tu cargo y qué responsabilidad tienes en este proyecto? ¿Quién decide al final?',
    why: 'Mapa de decisores y stakeholders',
    area: 'negocio',
    block: 'cliente',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['descubrimiento', 'presupuesto', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  {
    field_key: 'business.team_size',
    question: '¿Cuántas personas trabajan en la empresa (aprox.) y cuántas tocan este proceso?',
    why: 'Escala y capacidad de adopción',
    area: 'negocio',
    block: 'cliente',
    importance: 'recommended',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['descubrimiento', 'roi'],
    forbids_early_solution: true,
  },
  // —— Problema ——
  {
    field_key: 'problem.main_problem',
    question: '¿Cuál es el problema principal que queréis resolver hoy?',
    why: 'Núcleo de la propuesta y del ROI',
    area: 'problema',
    block: 'problema',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'roi', 'cerrar_huecos'],
    forbids_early_solution: true,
    triggers: ['instagram', 'whatsapp', 'email', 'llamad', 'ticket', 'lead'],
  },
  {
    field_key: 'problem.bottlenecks',
    question: '¿Dónde están los cuellos de botella y qué tareas os quitan más tiempo o generan más errores?',
    why: 'Prioriza dónde automatizar de verdad',
    area: 'problema',
    block: 'problema',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'funcional', 'cerrar_huecos'],
    forbids_early_solution: true,
    requires: ['problem.main_problem'],
  },
  {
    field_key: 'problem.if_unsolved',
    question: '¿Qué ocurre si este problema no se soluciona? ¿Desde cuándo existe y por qué ahora?',
    why: 'Urgencia y coste de no actuar',
    area: 'problema',
    block: 'problema',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'roi', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  {
    field_key: 'problem.priority',
    question: 'En una escala 1–10, ¿qué prioridad tiene este proyecto frente a otras iniciativas?',
    why: 'Calibra expectativas y timeline',
    area: 'problema',
    block: 'problema',
    importance: 'recommended',
    expected_type: 'number',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['descubrimiento', 'presupuesto'],
    forbids_early_solution: true,
  },
  // —— Proceso ——
  {
    field_key: 'process.current_flow',
    question: '¿Cómo es el proceso actual, paso a paso, desde que entra la demanda hasta que se resuelve?',
    why: 'Mapa operativo para diseñar la solución',
    area: 'proceso',
    block: 'proceso',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['descubrimiento', 'funcional', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  {
    field_key: 'process.trigger',
    question: '¿Qué desencadena el inicio del proceso y qué excepciones o casos especiales aparecen?',
    why: 'Límites de automatización y edge cases',
    area: 'proceso',
    block: 'proceso',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['descubrimiento', 'funcional', 'cerrar_huecos'],
    forbids_early_solution: true,
    requires: ['process.current_flow'],
  },
  {
    field_key: 'process.human_only',
    question: '¿En qué pasos debe intervenir siempre una persona y qué no debería automatizarse?',
    why: 'Diseño de handoff humano',
    area: 'proceso',
    block: 'proceso',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['descubrimiento', 'funcional', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  // —— Volumen ——
  {
    field_key: 'volume.monthly_volume',
    question: '¿Qué volumen manejáis (día/semana/mes: leads, llamadas, tickets, mensajes…)? Dad una cifra aproximada.',
    why: 'Dimensiona infraestructura y ahorro',
    area: 'volumen',
    block: 'volumen',
    importance: 'critical',
    expected_type: 'number',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['descubrimiento', 'roi', 'presupuesto', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  {
    field_key: 'volume.channels',
    question: '¿Por qué canales entra ese volumen y en qué franja horaria hay más pico?',
    why: 'Canales y picos afectan diseño y coste',
    area: 'volumen',
    block: 'volumen',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'roi', 'funcional'],
    forbids_early_solution: true,
    triggers: ['instagram', 'whatsapp', 'email', 'web', 'teléfono', 'telefono'],
  },
  {
    field_key: 'volume.peaks',
    question: '¿Hay picos de demanda? ¿El volumen está creciendo y qué esperáis en los próximos meses?',
    why: 'Escalabilidad y capacidad',
    area: 'volumen',
    block: 'volumen',
    importance: 'recommended',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'roi'],
    forbids_early_solution: true,
  },
  {
    field_key: 'volume.repetitive_pct',
    question: '¿Qué porcentaje de casos es repetitivo frente a los que requieren intervención humana?',
    why: 'Estimación de automatización viable',
    area: 'volumen',
    block: 'volumen',
    importance: 'important',
    expected_type: 'number',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'roi', 'funcional'],
    forbids_early_solution: true,
  },
  // —— ROI ——
  {
    field_key: 'roi.people_involved',
    question: '¿Cuántas personas intervienen hoy en este proceso y cuántas horas/semana dedican en total?',
    why: 'Base del cálculo de ahorro',
    area: 'roi',
    block: 'roi',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['roi', 'presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'roi.hourly_cost',
    question: '¿Cuál es aproximadamente el coste por hora (o coste mensual del equipo) que interviene?',
    why: 'Convierte horas en € de ROI',
    area: 'roi',
    block: 'roi',
    importance: 'important',
    expected_type: 'number',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['roi', 'presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'roi.lost_opportunity',
    question: '¿Qué se pierde hoy por no responder a tiempo o por errores (leads, ventas, reclamaciones)?',
    why: 'Impacto de no hacer el proyecto',
    area: 'roi',
    block: 'roi',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['roi', 'cerrar_huecos'],
  },
  {
    field_key: 'roi.avg_deal_value',
    question: '¿Cuál es el valor medio de un cliente o de una venta, y la tasa de conversión aproximada?',
    why: 'Cuantifica ingresos recuperables',
    area: 'roi',
    block: 'roi',
    importance: 'recommended',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['roi', 'presupuesto'],
  },
  // —— Herramientas ——
  {
    field_key: 'integrations.systems',
    question: '¿Qué sistemas usáis hoy (CRM, ERP, email, WhatsApp, teléfono, Excel…)?',
    why: 'Inventario de integraciones',
    area: 'integraciones',
    block: 'herramientas',
    importance: 'critical',
    expected_type: 'list',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['integraciones', 'tecnico', 'descubrimiento', 'cerrar_huecos'],
    forbids_early_solution: true,
    triggers: ['crm', 'hubspot', 'salesforce', 'whatsapp', 'excel'],
  },
  {
    field_key: 'integrations.api_access',
    question: 'De esos sistemas, ¿hay API / webhooks disponibles y quién puede dar accesos?',
    why: 'Riesgo técnico y plazos',
    area: 'integraciones',
    block: 'herramientas',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['integraciones', 'tecnico', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  {
    field_key: 'integrations.primary_source',
    question: '¿Qué herramienta debe actuar como fuente principal de verdad de los datos?',
    why: 'Arquitectura de datos sin asumir el stack',
    area: 'integraciones',
    block: 'herramientas',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['integraciones', 'tecnico', 'cerrar_huecos'],
    forbids_early_solution: true,
  },
  {
    field_key: 'tech.environments',
    question: '¿Tenéis entorno de pruebas y producción separados? ¿Dónde debe alojarse la solución?',
    why: 'Arquitectura y compliance',
    area: 'tecnico',
    block: 'herramientas',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['tecnico', 'cerrar_huecos'],
  },
  // —— CRM ——
  {
    field_key: 'crm.name',
    question: '¿Qué CRM utilizáis (o dónde guardáis contactos/oportunidades si no hay CRM)?',
    why: 'Condiciona el diseño de datos',
    area: 'datos',
    block: 'crm',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['integraciones', 'descubrimiento', 'cerrar_huecos'],
    triggers: ['crm', 'hubspot', 'pipedrive', 'salesforce', 'zoho'],
  },
  {
    field_key: 'crm.entities',
    question: '¿Con qué entidades trabajáis (contactos, empresas, deals, tickets…) y qué campos clave usáis?',
    why: 'Modelo de datos de integración',
    area: 'datos',
    block: 'crm',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['integraciones', 'tecnico', 'cerrar_huecos'],
    requires: ['crm.name'],
  },
  {
    field_key: 'crm.read_write',
    question: '¿Qué debe leer y escribir el sistema en el CRM, y qué no se debe modificar nunca?',
    why: 'Permisos y seguridad de datos',
    area: 'datos',
    block: 'crm',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['integraciones', 'funcional', 'cerrar_huecos'],
  },
  {
    field_key: 'users.roles',
    question: '¿Quién usará la solución y qué roles tienen (comercial, admin, cliente final…)?',
    why: 'Permisos, UX y alcance',
    area: 'usuarios',
    block: 'crm',
    importance: 'important',
    expected_type: 'list',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['funcional', 'descubrimiento'],
  },
  // —— IA ——
  {
    field_key: 'ai.task',
    question: 'Si hay IA: ¿qué tarea debe hacer (responder, clasificar, extraer, sugerir…) y qué decisiones puede tomar sola?',
    why: 'Alcance real de la IA',
    area: 'datos',
    block: 'ia',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['funcional', 'tecnico', 'cerrar_huecos'],
    project_types: ['rag', 'text_agent', 'voice_agent', 'custom', 'unclear'],
  },
  {
    field_key: 'data.sources',
    question: '¿Qué datos o documentos alimentarán la solución (FAQs, PDFs, tickets, históricos)?',
    why: 'Necesario para RAG / reglas / calidad',
    area: 'datos',
    block: 'ia',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['tecnico', 'funcional', 'descubrimiento'],
    project_types: ['rag', 'text_agent', 'voice_agent', 'custom', 'unclear'],
  },
  {
    field_key: 'ai.human_approval',
    question: '¿Qué debe hacer la IA cuando no sepa la respuesta? ¿Qué requiere siempre aprobación humana?',
    why: 'Guardrails y calidad',
    area: 'datos',
    block: 'ia',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['funcional', 'cerrar_huecos'],
    project_types: ['rag', 'text_agent', 'voice_agent', 'custom', 'unclear'],
  },
  {
    field_key: 'rag.sources',
    question: '¿Cuáles son las fuentes de conocimiento (nº docs, formatos, frecuencia de actualización)?',
    why: 'Diseño RAG y coste de ingesta',
    area: 'datos',
    block: 'ia',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['tecnico', 'funcional', 'cerrar_huecos'],
    project_types: ['rag'],
  },
  // —— Tono ——
  {
    field_key: 'tone.style',
    question: '¿Qué tono debe usar el sistema (formal, cercano, técnico…) y de tú o de usted?',
    why: 'Consistencia de marca',
    area: 'alcance',
    block: 'tono',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['funcional', 'cerrar_huecos'],
    project_types: ['text_agent', 'voice_agent', 'rag', 'custom', 'unclear'],
  },
  {
    field_key: 'tone.languages',
    question: '¿En qué idiomas debe responder y qué expresiones o promesas debe evitar?',
    why: 'Límites de comunicación',
    area: 'alcance',
    block: 'tono',
    importance: 'recommended',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['funcional'],
  },
  // —— Reglas ——
  {
    field_key: 'rules.auto_vs_human',
    question: '¿Qué casos puede resolver automáticamente y cuáles deben derivarse siempre a una persona?',
    why: 'Matriz de automatización vs humano',
    area: 'alcance',
    block: 'reglas',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['funcional', 'cerrar_huecos'],
  },
  {
    field_key: 'rules.escalation',
    question: '¿A quién se deriva, en qué horario, y qué información debe llevar el handoff (resumen, historial…)?',
    why: 'Operativa de escalado',
    area: 'alcance',
    block: 'reglas',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['funcional', 'cerrar_huecos'],
  },
  {
    field_key: 'voice.inbound_outbound',
    question: '¿Las llamadas serán entrantes, salientes o ambas? ¿Duración media y simultaneidad esperada?',
    why: 'Dimensionado de voz / coste Retell',
    area: 'volumen',
    block: 'volumen',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['funcional', 'tecnico', 'presupuesto', 'cerrar_huecos'],
    project_types: ['voice_agent'],
  },
  {
    field_key: 'voice.transfer_rules',
    question: '¿Cuándo debe transferir a un humano y qué información debe recoger antes?',
    why: 'Reglas de negocio del agente de voz',
    area: 'alcance',
    block: 'reglas',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['funcional', 'cerrar_huecos'],
    project_types: ['voice_agent'],
  },
  // —— Legal ——
  {
    field_key: 'security.gdpr',
    question: '¿Hay datos personales o sensibles? ¿Qué requisitos de RGPD / retención / consentimiento aplican?',
    why: 'Bloquea diseño y cláusulas — sin conclusión jurídica definitiva',
    area: 'seguridad',
    block: 'legal',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: true,
    modes: ['tecnico', 'descubrimiento', 'cerrar_huecos'],
  },
  {
    field_key: 'legal.needs_review',
    question: '¿Qué canales o acciones deberían validarse con asesoría legal o de protección de datos antes de automatizar?',
    why: 'Marca puntos que requieren validación jurídica (sin afirmar legalidad)',
    area: 'seguridad',
    block: 'legal',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['tecnico', 'cerrar_huecos'],
  },
  // —— Métricas ——
  {
    field_key: 'metrics.success',
    question: '¿Cómo sabréis que el proyecto ha funcionado? ¿Qué indicador queréis mejorar y con qué objetivo?',
    why: 'Define éxito medible',
    area: 'negocio',
    block: 'metricas',
    importance: 'critical',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['descubrimiento', 'funcional', 'cerrar_huecos'],
  },
  {
    field_key: 'metrics.kpi_current',
    question: '¿Cuál es el valor actual de ese indicador y qué sería un resultado mínimo aceptable vs excelente?',
    why: 'Baseline y targets',
    area: 'negocio',
    block: 'metricas',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['funcional', 'roi', 'cerrar_huecos'],
  },
  // —— Alcance ——
  {
    field_key: 'scope.must_have',
    question: '¿Qué funcionalidades son imprescindibles en la v1 (must-have)?',
    why: 'Alcance cerrado para presupuestar',
    area: 'alcance',
    block: 'alcance',
    importance: 'critical',
    expected_type: 'list',
    blocks_budget: true,
    blocks_dev: true,
    modes: ['funcional', 'presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'scope.nice_to_have',
    question: '¿Qué puede quedarse para una segunda fase (importante o deseable)?',
    why: 'Priorización por fases',
    area: 'alcance',
    block: 'alcance',
    importance: 'important',
    expected_type: 'list',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['funcional', 'presupuesto'],
  },
  {
    field_key: 'scope.out_of_scope',
    question: '¿Qué queda explícitamente fuera de esta fase?',
    why: 'Evita scope creep en la propuesta',
    area: 'alcance',
    block: 'alcance',
    importance: 'important',
    expected_type: 'list',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['funcional', 'presupuesto', 'cerrar_huecos'],
  },
  // —— Calendario ——
  {
    field_key: 'impl.timeline',
    question: '¿Cuándo queréis empezar y hay fecha límite, campaña o evento relacionado?',
    why: 'Planificación y factor de riesgo',
    area: 'implantacion',
    block: 'calendario',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['presupuesto', 'descubrimiento', 'cerrar_huecos'],
  },
  {
    field_key: 'impl.access_owners',
    question: '¿Quién dará accesos y documentación, y quién validará las pruebas?',
    why: 'Dependencias del cliente',
    area: 'implantacion',
    block: 'calendario',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'impl.pilot',
    question: '¿Hace falta piloto? ¿Con qué grupo, duración y criterios de éxito?',
    why: 'Reduce riesgo de adopción',
    area: 'implantacion',
    block: 'calendario',
    importance: 'recommended',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['presupuesto', 'funcional'],
  },
  {
    field_key: 'maint.expectations',
    question: '¿Qué esperáis de mantenimiento/soporte tras el go-live (horario, SLA, cambios)?',
    why: 'Mensualidad y compromiso',
    area: 'mantenimiento',
    block: 'calendario',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['presupuesto', 'cerrar_huecos'],
  },
  // —— Presupuesto ——
  {
    field_key: 'budget.range',
    question: '¿Hay un rango de inversión o techo aproximado para el setup?',
    why: 'Encaja propuesta sin perder tiempo',
    area: 'presupuesto',
    block: 'presupuesto',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: true,
    blocks_dev: false,
    modes: ['presupuesto', 'cerrar_huecos'],
  },
  {
    field_key: 'budget.decision_makers',
    question: '¿Quién decide la compra, qué necesitan ver para aprobar y cuándo esperan decidir?',
    why: 'Cierra el ciclo comercial',
    area: 'presupuesto',
    block: 'presupuesto',
    importance: 'important',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['presupuesto', 'descubrimiento', 'cerrar_huecos'],
  },
  {
    field_key: 'budget.blockers',
    question: '¿Qué podría impedir que el proyecto avance? ¿Estáis evaluando otras soluciones?',
    why: 'Riesgos comerciales',
    area: 'presupuesto',
    block: 'presupuesto',
    importance: 'recommended',
    expected_type: 'text',
    blocks_budget: false,
    blocks_dev: false,
    modes: ['presupuesto', 'cerrar_huecos'],
  },
]

export function questionsFor(
  mode: AuditMode,
  projectTypes: AuditProjectType[]
): CatalogQuestion[] {
  const types = projectTypes.length ? projectTypes : (['unclear'] as AuditProjectType[])
  return BASE_QUESTIONS.filter((q) => {
    if (!q.modes.includes(mode) && mode !== 'cerrar_huecos') {
      // en cerrar_huecos ya filtramos por modes arriba incluyendo cerrar_huecos
    }
    if (!q.modes.includes(mode)) return false
    if (!q.project_types || q.project_types.length === 0) return true
    return q.project_types.some((t) => types.includes(t) || types.includes('unclear'))
  })
}

export function pickNextCatalogQuestion(
  mode: AuditMode,
  projectTypes: AuditProjectType[],
  structured: AuditStructured,
  preferredArea?: AuditAreaId | null
): CurrentQuestion | null {
  const pool = questionsFor(mode, projectTypes)
  const unanswered = pool.filter((q) => {
    const f = structured[q.field_key]
    if (!f) return true
    // skipped/unknown/etc. no se vuelven a preguntar automáticamente (van a Pendientes)
    return f.status === 'empty' || f.status === 'partial'
  })

  const criticalFirst = [...unanswered].sort((a, b) => {
    const rank = { critical: 0, important: 1, recommended: 2, optional: 3 }
    return rank[a.importance] - rank[b.importance]
  })

  const inArea = preferredArea
    ? criticalFirst.filter((q) => q.area === preferredArea)
    : []
  const pick = inArea[0] || criticalFirst[0]
  if (!pick) return null

  return {
    id: `cat_${pick.field_key}`,
    field_key: pick.field_key,
    question: pick.question,
    why: pick.why,
    area: pick.area,
    importance: pick.importance,
    answer_type: 'textarea',
    expected_type: pick.expected_type,
    blocks_budget: pick.blocks_budget,
    blocks_dev: pick.blocks_dev,
  }
}

export function computeAreaProgress(structured: AuditStructured): {
  id: AuditAreaId
  label: string
  answered: number
  critical_missing: number
  sufficiency: number
}[] {
  return AUDIT_AREAS.map((area) => {
    const qs = BASE_QUESTIONS.filter((q) => q.area === area.id)
    if (qs.length === 0) {
      return { id: area.id, label: area.label, answered: 0, critical_missing: 0, sufficiency: 0 }
    }
    let answered = 0
    let criticalMissing = 0
    let weightDone = 0
    let weightTotal = 0
    for (const q of qs) {
      const w = q.importance === 'critical' ? 4 : q.importance === 'important' ? 2 : 1
      weightTotal += w
      const f = structured[q.field_key]
      const ok =
        f &&
        (f.status === 'answered' ||
          f.status === 'pending_confirmation' ||
          f.status === 'not_applicable')
      if (ok) {
        answered += 1
        weightDone += w * (f.status === 'pending_confirmation' ? 0.7 : 1)
      } else if (q.importance === 'critical') {
        criticalMissing += 1
      }
    }
    const sufficiency = weightTotal > 0 ? Math.round((weightDone / weightTotal) * 100) : 0
    return {
      id: area.id,
      label: area.label,
      answered,
      critical_missing: criticalMissing,
      sufficiency,
    }
  })
}
