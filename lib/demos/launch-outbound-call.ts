import { insertDemoLlamada } from './calls-store'
import { getDemoFormularioOutbound } from './demo-detail'
import {
  buildRetellVariablesFromForm,
  DEFAULT_OUTBOUND_FORM_FIELDS,
  validateOutboundForm,
} from './outbound-form'
import { matchAuthorizedDemoPhone } from './phone-match'
import { RetellApiError, retellCreatePhoneCall, retellResolveFromNumber } from './retell'
import type { DemoListItem } from './types'

export type LaunchOutboundResult = {
  call_id: string | null
  call_status: string
  from_number: string
  numero_destino: string
  variables: Record<string, string>
  call: Record<string, unknown> | null
}

export async function launchOutboundCall(
  demo: DemoListItem,
  rawValues: Record<string, string>
): Promise<LaunchOutboundResult> {
  if (demo.tipo !== 'voz') {
    throw new Error('Solo las demos de voz pueden lanzar llamadas')
  }
  if (demo.estado !== 'activa') {
    throw new Error('La demo no está activa')
  }
  if (!demo.direccion || !['outbound', 'ambos'].includes(demo.direccion)) {
    throw new Error('Esta demo no está configurada para llamadas salientes')
  }
  if (!demo.retell_agent_id) {
    throw new Error('La demo no tiene agente Retell configurado')
  }

  const formConfig = await getDemoFormularioOutbound(demo.id)
  const validationError = validateOutboundForm(formConfig, rawValues)
  if (validationError) throw new Error(validationError)

  const telefonoRaw = rawValues.telefono?.trim()
  if (!telefonoRaw) throw new Error('El teléfono de destino es obligatorio')

  const destinoAutorizado = matchAuthorizedDemoPhone(demo.numeros, telefonoRaw)
  if (!destinoAutorizado) {
    throw new Error(`El teléfono ${telefonoRaw} no está autorizado para esta demo`)
  }

  const retellVariables = buildRetellVariablesFromForm(formConfig, {
    ...rawValues,
    telefono: destinoAutorizado,
  })

  const fromNumber = await retellResolveFromNumber(demo.id)

  const result = await retellCreatePhoneCall({
    from_number: fromNumber,
    to_number: destinoAutorizado,
    override_agent_id: demo.retell_agent_id,
    demo_id: demo.id,
    retell_llm_dynamic_variables: retellVariables as Record<string, string>,
  })

  const callStatus = typeof result?.call_status === 'string' ? result.call_status : 'iniciada'

  await insertDemoLlamada({
    demo_id: demo.id,
    numero_destino: destinoAutorizado,
    call_id: typeof result?.call_id === 'string' ? result.call_id : null,
    estado: callStatus,
    variables: retellVariables,
  })

  return {
    call_id: typeof result?.call_id === 'string' ? result.call_id : null,
    call_status: callStatus,
    from_number: fromNumber,
    numero_destino: destinoAutorizado,
    variables: retellVariables as Record<string, string>,
    call: result,
  }
}

export async function recordFailedOutboundCall(
  demoId: number,
  rawValues: Record<string, string>,
  error: unknown
): Promise<void> {
  const telefono = rawValues.telefono?.trim()
  if (!telefono) return
  try {
    await insertDemoLlamada({
      demo_id: demoId,
      numero_destino: telefono,
      estado: 'error',
      variables: buildRetellVariablesFromForm(DEFAULT_OUTBOUND_FORM_FIELDS, rawValues),
      error_mensaje: error instanceof Error ? error.message : 'Error desconocido',
    })
  } catch {
    // tabla puede no existir
  }
}

export function outboundErrorMessage(err: unknown): string {
  if (err instanceof RetellApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Error al iniciar la llamada'
}

export function outboundErrorHint(err: unknown): string | undefined {
  if (err instanceof RetellApiError && err.status === 422) {
    return 'Comprueba el formato del teléfono (+34…) y que Retell tenga el número de origen configurado.'
  }
  return undefined
}
