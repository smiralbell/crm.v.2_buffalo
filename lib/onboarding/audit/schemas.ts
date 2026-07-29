import { z } from 'zod'

export const auditAnswerTypeSchema = z.enum([
  'text',
  'textarea',
  'single_select',
  'multi_select',
  'number',
  'currency',
  'percentage',
  'date',
  'yes_no',
  'scale',
  'confirmation',
])

export const auditModeSchema = z.enum([
  'descubrimiento',
  'roi',
  'funcional',
  'tecnico',
  'integraciones',
  'presupuesto',
  'cerrar_huecos',
])

/** Acepta nombres EN del contrato y los normalizamos a ES. */
const modeLooseSchema = z.union([
  auditModeSchema,
  z.enum(['discovery', 'functional', 'technical', 'integrations', 'budget', 'gaps']),
])

export const auditImportanceSchema = z.enum([
  'critical',
  'important',
  'recommended',
  'optional',
])

export const auditAiOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  description: z.string().optional(),
})

export const auditAiQuestionSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().min(1),
  helpText: z.string().optional(),
  reason: z.string().optional(),
  mode: modeLooseSchema.optional(),
  category: z.string().min(1).default('negocio'),
  fieldKey: z.string().min(1).optional(),
  importance: auditImportanceSchema.default('important'),
  answerType: auditAnswerTypeSchema.default('text'),
  options: z.array(auditAiOptionSchema).optional(),
  allowOther: z.boolean().optional(),
  unit: z.string().optional(),
})

export const auditAiContextUpdateSchema = z.object({
  path: z.string().min(1),
  value: z.unknown(),
  status: z.enum([
    'confirmed',
    'estimated',
    'pending_confirmation',
    'unknown',
    'not_applicable',
    'answered',
    'partial',
  ]),
  source: z.enum(['client', 'buffalo', 'ai_inference', 'ai_assumption', 'client_estimate']),
  confidence: z.number().min(0).max(1).default(0.7),
})

export const auditAiGapSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  importance: auditImportanceSchema.default('important'),
  owner: z.enum(['client', 'buffalo', 'unknown']).default('unknown'),
  category: z.string().optional(),
})

export const auditAiContradictionSchema = z.object({
  description: z.string().min(1),
  relatedMessageIds: z.array(z.string()).default([]),
})

export const auditAiProgressSchema = z.object({
  category: z.string().min(1),
  percentage: z.number().min(0).max(100),
})

export const auditAiResponseSchema = z.object({
  assistantMessage: z.string().default(''),
  question: auditAiQuestionSchema.optional().nullable(),
  contextUpdates: z.array(auditAiContextUpdateSchema).default([]),
  detectedGaps: z.array(auditAiGapSchema).default([]),
  contradictions: z.array(auditAiContradictionSchema).default([]),
  progressUpdates: z.array(auditAiProgressSchema).default([]),
})

export type AuditAIResponse = z.infer<typeof auditAiResponseSchema>

export function normalizeAiMode(
  mode?: z.infer<typeof modeLooseSchema> | null
): z.infer<typeof auditModeSchema> | undefined {
  if (!mode) return undefined
  const map: Record<string, z.infer<typeof auditModeSchema>> = {
    discovery: 'descubrimiento',
    functional: 'funcional',
    technical: 'tecnico',
    integrations: 'integraciones',
    budget: 'presupuesto',
    gaps: 'cerrar_huecos',
  }
  return (map[mode] || mode) as z.infer<typeof auditModeSchema>
}
