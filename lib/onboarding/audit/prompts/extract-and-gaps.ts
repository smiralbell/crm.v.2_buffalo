export const AUDIT_CONTEXT_EXTRACT_PROMPT = `Tu tarea es extraer y actualizar el contexto estructurado del proyecto a partir de la última respuesta del cliente.
Devuelve SOLO JSON AuditAIResponse.
- Pon en contextUpdates solo hechos nuevos o corregidos (paths estables, p.ej. business.company_summary, volume.monthly_leads).
- status: confirmed si el cliente lo afirmó con claridad; estimated si es aproximación; pending_confirmation si es vago; unknown si no lo sabe.
- source: client para lo dicho por el cliente; ai_inference solo para deducciones explícitas (nunca las presentes como confirmadas).
- Puedes incluir question:null y assistantMessage vacío si solo extrayes contexto.
- detectedGaps y contradictions si aplica.
`

export const AUDIT_GAPS_PROMPT = `Analiza el contexto completo, preguntas y respuestas de la auditoría.
Devuelve SOLO JSON AuditAIResponse (question puede ser null).
Prioriza detectedGaps por impacto: críticos que bloquean propuesta, presupuesto o viabilidad; luego contradicciones e incompletos.
En progressUpdates estima % real de cobertura por categoría (0-100). Una categoría no puede ser 100 si faltan críticos.
assistantMessage: resumen breve en español para el equipo Buffalo.
`
