const RETELL_API_BASE = 'https://api.retellai.com'

export class RetellApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message)
    this.name = 'RetellApiError'
  }
}

function retellApiKey(): string {
  const key = process.env.RETELL_API_KEY
  if (!key) throw new Error('RETELL_API_KEY no está configurada')
  return key
}

function retellHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${retellApiKey()}`,
    'Content-Type': 'application/json',
  }
}

async function retellRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; allowNotFound?: boolean } = {}
): Promise<T | null> {
  const method = options.method || (options.body !== undefined ? 'POST' : 'GET')
  const res = await fetch(`${RETELL_API_BASE}${path}`, {
    method,
    headers: retellHeaders(),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const text = await res.text()

  if (options.allowNotFound && res.status === 404) return null

  if (!res.ok) {
    let detail = text.slice(0, 500)
    try {
      const json = JSON.parse(text) as { message?: string; error?: string }
      detail = json.message || json.error || detail
    } catch {
      // usar texto crudo
    }
    throw new RetellApiError(`Retell ${method} ${path}: ${detail}`, res.status, text)
  }

  if (!text) return {} as T
  return JSON.parse(text) as T
}

export type RetellProvisionResult = {
  knowledge_base_id: string
  llm_id: string
  agent_id: string
}

export async function retellCreateKnowledgeBase(
  nombreCliente: string,
  baseConocimiento: string
): Promise<string> {
  const data = await retellRequest<{ knowledge_base_id?: string }>('/create-knowledge-base', {
    method: 'POST',
    body: {
      knowledge_base_name: `KB - ${nombreCliente}`,
      knowledge_base_texts: [
        {
          title: `Base de conocimiento ${nombreCliente}`,
          text: baseConocimiento || ' ',
        },
      ],
    },
  })
  const id = data?.knowledge_base_id
  if (!id) throw new Error('Retell no devolvió knowledge_base_id')
  return id
}

export async function retellCreateLlm(
  prompt: string,
  knowledgeBaseId: string
): Promise<string> {
  const data = await retellRequest<{ llm_id?: string }>('/create-retell-llm', {
    method: 'POST',
    body: {
      general_prompt: prompt,
      model: 'gpt-4o-mini',
      knowledge_base_ids: [knowledgeBaseId],
      begin_message: '',
    },
  })
  const id = data?.llm_id
  if (!id) throw new Error('Retell no devolvió llm_id')
  return id
}

export async function retellCreateAgent(
  nombreCliente: string,
  voiceId: string,
  llmId: string
): Promise<string> {
  const data = await retellRequest<{ agent_id?: string }>('/create-agent', {
    method: 'POST',
    body: {
      agent_name: `Demo - ${nombreCliente}`,
      voice_id: voiceId,
      response_engine: {
        type: 'retell-llm',
        llm_id: llmId,
      },
    },
  })
  const id = data?.agent_id
  if (!id) throw new Error('Retell no devolvió agent_id')
  return id
}

export async function retellProvisionVoiceDemo(input: {
  nombre_cliente: string
  prompt: string
  base_conocimiento: string
  voz_id: string
}): Promise<RetellProvisionResult> {
  const knowledge_base_id = await retellCreateKnowledgeBase(
    input.nombre_cliente,
    input.base_conocimiento
  )

  let llm_id: string | null = null
  let agent_id: string | null = null

  try {
    llm_id = await retellCreateLlm(input.prompt, knowledge_base_id)
    agent_id = await retellCreateAgent(input.nombre_cliente, input.voz_id, llm_id)
    return { knowledge_base_id, llm_id, agent_id }
  } catch (err) {
    await retellRollback({ agent_id, llm_id, knowledge_base_id })
    throw err
  }
}

export async function retellUpdateLlm(llmId: string, prompt: string, knowledgeBaseId: string) {
  await retellRequest(`/update-retell-llm/${encodeURIComponent(llmId)}`, {
    method: 'PATCH',
    body: {
      general_prompt: prompt,
      knowledge_base_ids: [knowledgeBaseId],
    },
  })
}

export async function retellUpdateKnowledgeBase(
  kbId: string,
  nombreCliente: string,
  baseConocimiento: string
) {
  await retellRequest(`/update-knowledge-base/${encodeURIComponent(kbId)}`, {
    method: 'PATCH',
    body: {
      knowledge_base_texts: [
        {
          title: `Base de conocimiento ${nombreCliente}`,
          text: baseConocimiento || ' ',
        },
      ],
    },
  })
}

export async function retellUpdateAgentVoice(agentId: string, voiceId: string) {
  await retellRequest(`/update-agent/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    body: { voice_id: voiceId },
  })
}

export async function retellDeleteAgent(agentId: string) {
  await retellRequest(`/delete-agent/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
    allowNotFound: true,
  })
}

export async function retellDeleteLlm(llmId: string) {
  await retellRequest(`/delete-retell-llm/${encodeURIComponent(llmId)}`, {
    method: 'DELETE',
    allowNotFound: true,
  })
}

export async function retellDeleteKnowledgeBase(kbId: string) {
  await retellRequest(`/delete-knowledge-base/${encodeURIComponent(kbId)}`, {
    method: 'DELETE',
    allowNotFound: true,
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
  return retellRequest<Record<string, unknown>>('/v2/create-phone-call', {
    method: 'POST',
    body: {
      from_number: input.from_number,
      to_number: input.to_number,
      override_agent_id: input.override_agent_id,
    },
  })
}

export function retellPhoneNumber(): string {
  const num = process.env.RETELL_PHONE_NUMBER?.trim()
  if (!num) throw new Error('RETELL_PHONE_NUMBER no está configurada')
  return num
}
