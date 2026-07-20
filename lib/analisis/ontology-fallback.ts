/** Ontología mínima si docs/CRM_GUIA_ANALISIS_IA.md no está en el contenedor */
export const CRM_ONTOLOGY_FALLBACK = `
# Ontología Buffalo CRM (fallback)

## Cadena de verdad
Contact → Lead → configuracion (onboarding) → sync proyectos (es_buffalo=false)
→ Poner en marcha (es_buffalo=true) → Gestión
→ Finalizar (status=active, fecha_fin_real) → producción
→ has_mensualidad → Retención

## Reglas de cartera abierta (UI Proyectos)
es_buffalo=TRUE AND status IN (development,active,paused)
AND lead_id NOT NULL AND leads.configuracion no vacía

## Dinero
- setup_fee_eur = one-shot proyectos
- monthly_fee_eur = MRR
- invoices.total = facturado (IVA incluido normalmente)
- bank_transactions.amount = caja real (no asumir = factura)

## Status proyecto
development | active (producción) | paused | churned

## Roles
admin todo · developer proyectos/tickets/retención · comercial cold call
`.trim()
