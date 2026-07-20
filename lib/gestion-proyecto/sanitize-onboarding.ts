import type { ProjectOnboarding } from './types'

/** Oculta datos comerciales y PII del cliente en la vista developer. */
export function sanitizeOnboardingForDeveloper(
  onboarding: ProjectOnboarding
): ProjectOnboarding {
  const stripLine = (line: string) => {
    const l = line.toLowerCase()
    if (
      l.includes('€') ||
      l.includes('eur') ||
      l.includes('setup') ||
      l.includes('mantenimiento') ||
      l.includes('mensualidad') ||
      l.includes('mensual') ||
      l.includes('precio') ||
      l.includes('tarifa') ||
      l.includes('factur') ||
      l.includes('mrr') ||
      l.includes('iva') ||
      /\d+[.,]\d{2}/.test(l)
    ) {
      return false
    }
    if (
      l.includes('email') ||
      l.includes('teléfono') ||
      l.includes('telefono') ||
      l.startsWith('empresa:') ||
      l.startsWith('cliente:') ||
      l.startsWith('contacto:') ||
      l.includes('@')
    ) {
      return false
    }
    return true
  }

  const clean = (text: string) =>
    text
      .split('\n')
      .filter(stripLine)
      .join('\n')
      .trim()

  return {
    ...onboarding,
    client_context: '',
    summary: clean(onboarding.summary),
    contacts: clean(onboarding.contacts),
    internal_notes: clean(onboarding.internal_notes),
  }
}
