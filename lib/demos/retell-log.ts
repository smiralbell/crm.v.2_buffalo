import { logDemoWebhook } from './webhook-log'

export async function logRetellStep(input: {
  step: string
  level?: 'info' | 'warn' | 'error' | 'success'
  message: string
  demo_id?: number | null
  details?: Record<string, unknown>
}): Promise<void> {
  const line = `[demos/retell] ${input.step}: ${input.message}`
  if (input.level === 'error') console.error(line, input.details || '')
  else console.log(line, input.details || '')

  try {
    await logDemoWebhook({
      step: `retell_${input.step}`,
      level: input.level || 'info',
      message: input.message,
      demo_id: input.demo_id ?? null,
      details: input.details,
    })
  } catch {
    // tabla de logs puede no existir
  }
}
