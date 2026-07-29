/** Detección client-safe de configuración de auditoría (sin Prisma). */

export function isAuditConfiguracion(raw?: string | null): boolean {
  if (!raw) return false
  try {
    let json = raw
    try {
      if (typeof atob === 'function') {
        json = decodeURIComponent(escape(atob(raw)))
      } else if (typeof Buffer !== 'undefined') {
        json = Buffer.from(raw, 'base64').toString('utf8')
      }
    } catch {
      try {
        if (typeof Buffer !== 'undefined') {
          json = Buffer.from(raw, 'base64').toString('utf8')
        }
      } catch {
        /* raw puede ser JSON plano */
      }
    }
    const cfg = JSON.parse(json) as {
      service_type?: string
      title?: string
      onboarding_notes?: string
    }
    if (cfg.service_type === 'audit') return true
    if ((cfg.title || '').toLowerCase().includes('auditor')) return true
    if ((cfg.onboarding_notes || '').includes('audit_status:')) return true
    return false
  } catch {
    return /auditor[ií]a|"service_type"\s*:\s*"audit"/i.test(raw)
  }
}
