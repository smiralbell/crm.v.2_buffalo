import { logRetellStep } from './retell-log'
import { normalizeRetellE164, phoneDigits } from './phone-match'

const RETELL_API_BASE = 'https://api.retellai.com'

export class RetellApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
    public step?: string
  ) {
    super(message)
    this.name = 'RetellApiError'
  }
}

export type RetellVoiceOption = {
  voice_id: string
  voice_name?: string
  provider?: string
  gender?: string
  accent?: string
  preview_audio_url?: string
}

function retellApiKey(): string {
  const key = process.env.RETELL_API_KEY
  if (!key) throw new Error('RETELL_API_KEY no está configurada')
  return key
}

function truncateKbName(nombreCliente: string): string {
  const name = `KB ${nombreCliente}`.trim()
  return name.length > 40 ? name.slice(0, 40) : name
}

function parseRetellError(text: string, status: number): string {
  try {
    const json = JSON.parse(text) as { message?: string; error?: string; status?: string }
    return json.message || json.error || text.slice(0, 500)
  } catch {
    return text.slice(0, 500) || `HTTP ${status}`
  }
}

async function retellJsonRequest<T>(
  path: string,
  options: {
    method?: string
    body?: unknown
    allowNotFound?: boolean
    step?: string
    demoId?: number
  } = {}
): Promise<T | null> {
  const method = options.method || (options.body !== undefined ? 'POST' : 'GET')

  await logRetellStep({
    step: options.step || path.replace(/\//g, '_'),
    message: `${method} ${path}`,
    demo_id: options.demoId,
    details: options.body ? { body_keys: Object.keys(options.body as object) } : undefined,
  })

  const res = await fetch(`${RETELL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${retellApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const text = await res.text()

  if (options.allowNotFound && res.status === 404) return null

  if (!res.ok) {
    const detail = parseRetellError(text, res.status)
    await logRetellStep({
      step: options.step || 'error',
      level: 'error',
      message: `${method} ${path} → ${res.status}: ${detail}`,
      demo_id: options.demoId,
      details: { status: res.status, response: text.slice(0, 2000) },
    })
    throw new RetellApiError(
      `Retell ${method} ${path}: ${detail}`,
      res.status,
      text,
      options.step
    )
  }

  if (!text) return {} as T
  return JSON.parse(text) as T
}

async function retellMultipartRequest<T>(
  path: string,
  formData: FormData,
  options: { method?: string; step?: string; demoId?: number } = {}
): Promise<T> {
  const method = options.method || 'POST'

  await logRetellStep({
    step: options.step || 'multipart',
    message: `${method} ${path} (multipart)`,
    demo_id: options.demoId,
  })

  const res = await fetch(`${RETELL_API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${retellApiKey()}` },
    body: formData,
  })

  const text = await res.text()

  if (!res.ok) {
    const detail = parseRetellError(text, res.status)
    await logRetellStep({
      step: options.step || 'multipart_error',
      level: 'error',
      message: `${method} ${path} → ${res.status}: ${detail}`,
      demo_id: options.demoId,
      details: { status: res.status, response: text.slice(0, 2000) },
    })
    throw new RetellApiError(
      `Retell ${method} ${path}: ${detail}`,
      res.status,
      text,
      options.step
    )
  }

  if (!text) return {} as T
  return JSON.parse(text) as T
}

function buildKbFormData(nombreCliente: string, baseConocimiento: string): FormData {
  const fd = new FormData()
  fd.append('knowledge_base_name', truncateKbName(nombreCliente))
  fd.append(
    'knowledge_base_texts',
    JSON.stringify([
      {
        title: `Base ${nombreCliente}`.slice(0, 80),
        text: baseConocimiento?.trim() || 'Sin contenido.',
      },
    ])
  )
  return fd
}

export async function retellListVoices(): Promise<RetellVoiceOption[]> {
  const data = await retellJsonRequest<RetellVoiceOption[]>('/list-voices', {
    method: 'GET',
    step: 'list_voices',
  })
  if (!Array.isArray(data)) return []
  return data
    .filter((v) => v && typeof v.voice_id === 'string')
    .sort((a, b) => (a.voice_name || a.voice_id).localeCompare(b.voice_name || b.voice_id))
}

export type RetellProvisionResult = {
  knowledge_base_id: string
  llm_id: string
  agent_id: string
}

export async function retellCreateKnowledgeBase(
  nombreCliente: string,
  baseConocimiento: string,
  demoId?: number
): Promise<string> {
  const fd = buildKbFormData(nombreCliente, baseConocimiento)
  const data = await retellMultipartRequest<{ knowledge_base_id?: string }>(
    '/create-knowledge-base',
    fd,
    { step: 'create_kb', demoId }
  )
  const id = data?.knowledge_base_id
  if (!id) throw new Error('Retell no devolvió knowledge_base_id')
  await logRetellStep({
    step: 'create_kb',
    level: 'success',
    message: `KB creada: ${id}`,
    demo_id: demoId,
  })
  return id
}

export async function retellCreateLlm(
  prompt: string,
  knowledgeBaseId: string,
  demoId?: number,
  beginMessage = ''
): Promise<string> {
  const data = await retellJsonRequest<{ llm_id?: string }>('/create-retell-llm', {
    method: 'POST',
    body: {
      general_prompt: prompt,
      model: 'gpt-4o-mini',
      knowledge_base_ids: [knowledgeBaseId],
      begin_message: beginMessage,
    },
    step: 'create_llm',
    demoId,
  })
  const id = data?.llm_id
  if (!id) throw new Error('Retell no devolvió llm_id')
  await logRetellStep({
    step: 'create_llm',
    level: 'success',
    message: `LLM creado: ${id}`,
    demo_id: demoId,
  })
  return id
}

export async function retellCreateAgent(
  nombreCliente: string,
  voiceId: string,
  llmId: string,
  demoId?: number
): Promise<string> {
  const data = await retellJsonRequest<{ agent_id?: string }>('/create-agent', {
    method: 'POST',
    body: {
      agent_name: `Demo - ${nombreCliente}`.slice(0, 60),
      voice_id: voiceId,
      response_engine: {
        type: 'retell-llm',
        llm_id: llmId,
      },
    },
    step: 'create_agent',
    demoId,
  })
  const id = data?.agent_id
  if (!id) throw new Error('Retell no devolvió agent_id')
  await logRetellStep({
    step: 'create_agent',
    level: 'success',
    message: `Agente creado: ${id}`,
    demo_id: demoId,
  })
  return id
}

export async function retellProvisionVoiceDemo(
  input: {
    nombre_cliente: string
    prompt: string
    base_conocimiento: string
    frase_inicial?: string
    voz_id: string
  },
  demoId?: number
): Promise<RetellProvisionResult> {
  const knowledge_base_id = await retellCreateKnowledgeBase(
    input.nombre_cliente,
    input.base_conocimiento,
    demoId
  )

  let llm_id: string | null = null
  let agent_id: string | null = null

  try {
    llm_id = await retellCreateLlm(
      input.prompt,
      knowledge_base_id,
      demoId,
      input.frase_inicial?.trim() ?? ''
    )
    agent_id = await retellCreateAgent(
      input.nombre_cliente,
      input.voz_id,
      llm_id,
      demoId
    )
    return { knowledge_base_id, llm_id, agent_id }
  } catch (err) {
    await retellRollback({ agent_id, llm_id, knowledge_base_id })
    throw err
  }
}

export async function retellUpdateLlm(
  llmId: string,
  prompt: string,
  knowledgeBaseId: string,
  demoId?: number,
  beginMessage?: string
) {
  const body: Record<string, unknown> = {
    general_prompt: prompt,
    knowledge_base_ids: [knowledgeBaseId],
  }
  if (beginMessage !== undefined) {
    body.begin_message = beginMessage
  }
  await retellJsonRequest(`/update-retell-llm/${encodeURIComponent(llmId)}`, {
    method: 'PATCH',
    body,
    step: 'update_llm',
    demoId,
  })
}

export async function retellUpdateKnowledgeBase(
  kbId: string,
  nombreCliente: string,
  baseConocimiento: string,
  demoId?: number
) {
  const fd = buildKbFormData(nombreCliente, baseConocimiento)
  await retellMultipartRequest(
    `/update-knowledge-base/${encodeURIComponent(kbId)}`,
    fd,
    { method: 'PATCH', step: 'update_kb', demoId }
  )
}

export async function retellUpdateAgentVoice(agentId: string, voiceId: string, demoId?: number) {
  await retellJsonRequest(`/update-agent/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    body: { voice_id: voiceId },
    step: 'update_agent_voice',
    demoId,
  })
}

export async function retellDeleteAgent(agentId: string) {
  await retellJsonRequest(`/delete-agent/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
    allowNotFound: true,
    step: 'delete_agent',
  })
}

export async function retellDeleteLlm(llmId: string) {
  await retellJsonRequest(`/delete-retell-llm/${encodeURIComponent(llmId)}`, {
    method: 'DELETE',
    allowNotFound: true,
    step: 'delete_llm',
  })
}

export async function retellDeleteKnowledgeBase(kbId: string) {
  await retellJsonRequest(`/delete-knowledge-base/${encodeURIComponent(kbId)}`, {
    method: 'DELETE',
    allowNotFound: true,
    step: 'delete_kb',
  })
}

export async function retellRollback(ids: {
  agent_id?: string | null
  llm_id?: string | null
  knowledge_base_id?: string | null
}) {
  if (ids.agent_id) {
    try {
      await retellDeleteAgent(ids.agent_id)
    } catch (e) {
      console.warn('[retell] rollback agent:', e)
    }
  }
  if (ids.llm_id) {
    try {
      await retellDeleteLlm(ids.llm_id)
    } catch (e) {
      console.warn('[retell] rollback llm:', e)
    }
  }
  if (ids.knowledge_base_id) {
    try {
      await retellDeleteKnowledgeBase(ids.knowledge_base_id)
    } catch (e) {
      console.warn('[retell] rollback kb:', e)
    }
  }
}

export async function retellDeleteVoiceResources(ids: {
  agent_id?: string | null
  llm_id?: string | null
  knowledge_base_id?: string | null
}) {
  await retellRollback(ids)
}

export async function retellListPhoneNumbers(): Promise<
  Array<{ phone_number: string; nickname?: string | null }>
> {
  const data = await retellJsonRequest<{
    items?: Array<{ phone_number: string; nickname?: string | null }>
  }>('/v2/list-phone-numbers', {
    method: 'GET',
    step: 'list_phone_numbers',
  })
  return data?.items ?? []
}

/** Resuelve el from_number: env RETELL_PHONE_NUMBER o primer número de la cuenta Retell */
export async function retellResolveFromNumber(demoId?: number): Promise<string> {
  const numbers = await retellListPhoneNumbers()

  if (numbers.length === 0) {
    throw new Error(
      'No hay números de teléfono en tu cuenta Retell. Compra o importa uno en el dashboard de Retell.'
    )
  }

  const envRaw = process.env.RETELL_PHONE_NUMBER?.trim().replace(/[.\s]+$/g, '')
  if (envRaw) {
    let envNorm: string
    try {
      envNorm = normalizeRetellE164(envRaw)
    } catch {
      throw new Error(
        `RETELL_PHONE_NUMBER no es válido (${envRaw}). Usa formato E.164, ej. +34612345678`
      )
    }

    const match = numbers.find(
      (n) =>
        n.phone_number === envNorm ||
        phoneDigits(n.phone_number) === phoneDigits(envNorm)
    )

    if (match) return match.phone_number

    const available = numbers.map((n) => n.phone_number).join(', ')
    throw new Error(
      `RETELL_PHONE_NUMBER (${envNorm}) no está en tu cuenta Retell. Números disponibles: ${available}`
    )
  }

  await logRetellStep({
    step: 'from_number',
    level: 'warn',
    message: `RETELL_PHONE_NUMBER no configurado, usando ${numbers[0].phone_number}`,
    demo_id: demoId,
  })

  return numbers[0].phone_number
}

export async function retellCreatePhoneCall(input: {
  from_number: string
  to_number: string
  override_agent_id: string
  demo_id?: number
  retell_llm_dynamic_variables?: Record<string, string>
}) {
  const from_number = normalizeRetellE164(input.from_number)
  const to_number = normalizeRetellE164(input.to_number)

  const body: Record<string, unknown> = {
    from_number,
    to_number,
    override_agent_id: input.override_agent_id,
    metadata: {
      demo_id: input.demo_id ? String(input.demo_id) : undefined,
      source: 'engranaje_demos',
    },
  }

  if (input.retell_llm_dynamic_variables && Object.keys(input.retell_llm_dynamic_variables).length > 0) {
    body.retell_llm_dynamic_variables = input.retell_llm_dynamic_variables
  }

  const result = await retellJsonRequest<Record<string, unknown>>('/v2/create-phone-call', {
    method: 'POST',
    body,
    step: 'create_phone_call',
    demoId: input.demo_id,
  })

  await logRetellStep({
    step: 'create_phone_call',
    level: 'success',
    message: `Llamada registrada ${from_number} → ${to_number}`,
    demo_id: input.demo_id,
    details: {
      call_id: result?.call_id,
      call_status: result?.call_status,
      agent_id: result?.agent_id,
    },
  })

  return result
}

export function retellPhoneNumber(): string {
  const raw = process.env.RETELL_PHONE_NUMBER?.trim().replace(/[.\s]+$/g, '')
  if (!raw) throw new Error('RETELL_PHONE_NUMBER no está configurada')
  return normalizeRetellE164(raw)
}
