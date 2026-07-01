import { logRetellStep } from './retell-log'

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
  demoId?: number
): Promise<string> {
  const data = await retellJsonRequest<{ llm_id?: string }>('/create-retell-llm', {
    method: 'POST',
    body: {
      general_prompt: prompt,
      model: 'gpt-4o-mini',
      knowledge_base_ids: [knowledgeBaseId],
      begin_message: '',
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
    llm_id = await retellCreateLlm(input.prompt, knowledge_base_id, demoId)
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
  demoId?: number
) {
  await retellJsonRequest(`/update-retell-llm/${encodeURIComponent(llmId)}`, {
    method: 'PATCH',
    body: {
      general_prompt: prompt,
      knowledge_base_ids: [knowledgeBaseId],
    },
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

export async function retellCreatePhoneCall(input: {
  from_number: string
  to_number: string
  override_agent_id: string
}) {
  return retellJsonRequest<Record<string, unknown>>('/v2/create-phone-call', {
    method: 'POST',
    body: {
      from_number: input.from_number,
      to_number: input.to_number,
      override_agent_id: input.override_agent_id,
    },
    step: 'create_phone_call',
  })
}

export function retellPhoneNumber(): string {
  const num = process.env.RETELL_PHONE_NUMBER?.trim()
  if (!num) throw new Error('RETELL_PHONE_NUMBER no está configurada')
  return num
}
