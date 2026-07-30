type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type MultimodalPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

function openRouterHeaders(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada')
  const siteUrl = process.env.OPENROUTER_HTTP_REFERER || process.env.NEXT_PUBLIC_BASE_URL || ''
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
    'X-OpenRouter-Title': 'Buffalo CRM - demos WhatsApp',
  }
}

export async function openRouterTranscribeAudio(
  base64: string,
  format: string
): Promise<string> {
  const model = process.env.DEMO_STT_MODEL || 'openai/whisper-large-v3'

  const res = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model,
      input_audio: { data: base64, format },
      language: 'es',
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenRouter STT ${res.status}: ${errText.slice(0, 500)}`)
  }

  const data = (await res.json()) as { text?: string }
  return data.text?.trim() || ''
}

export async function openRouterDescribeImage(
  base64: string,
  mimetype: string,
  userPrompt?: string
): Promise<string> {
  const models = [
    process.env.DEMO_VISION_MODEL,
    'openai/gpt-4o-mini',
    'google/gemini-2.0-flash-001',
    'google/gemini-flash-1.5',
  ].filter((m): m is string => Boolean(m))

  const instruction = userPrompt?.trim()
    ? `El usuario envió esta imagen con este mensaje: «${userPrompt.trim()}». Analiza la imagen y responde directamente a lo que pregunta o pide. Si hay texto visible en la imagen, transcríbelo. Responde en español, de forma clara y concisa.`
    : 'Describe esta imagen de forma concisa en español. Si hay texto visible, transcríbelo. Si es un documento o captura, resume el contenido relevante.'

  const dataUrl = `data:${mimetype};base64,${base64}`
  const userContent: MultimodalPart[] = [
    { type: 'text', text: instruction },
    { type: 'image_url', image_url: { url: dataUrl } },
  ]

  let lastError = 'OpenRouter vision sin respuesta'

  for (const model of models) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: openRouterHeaders(),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.2,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      lastError = `OpenRouter vision ${model} ${res.status}: ${errText.slice(0, 300)}`
      const retryable =
        res.status === 404 ||
        errText.includes('No endpoints found') ||
        errText.includes('not a valid model')
      if (retryable) continue
      throw new Error(lastError)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (content && typeof content === 'string' && content.trim()) {
      return content.trim()
    }
    lastError = `OpenRouter vision ${model} sin contenido`
  }

  throw new Error(lastError)
}

export async function openRouterChatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no está configurada')
  }

  const model = options?.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  const siteUrl = process.env.OPENROUTER_HTTP_REFERER || process.env.NEXT_PUBLIC_BASE_URL || ''

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
      'X-OpenRouter-Title': 'Buffalo CRM - evaluacion proyectos',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.3,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Respuesta OpenRouter sin contenido')
  }
  return content
}

/** Embeddings via OpenRouter (OpenAI-compatible). Returns one vector per input text. */
export async function openRouterEmbedTexts(
  texts: string[],
  options?: { model?: string }
): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada')
  if (texts.length === 0) return []

  const model = options?.model || process.env.DEMO_EMBEDDING_MODEL || 'openai/text-embedding-3-small'
  const siteUrl = process.env.OPENROUTER_HTTP_REFERER || process.env.NEXT_PUBLIC_BASE_URL || ''
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
    'X-OpenRouter-Title': 'Buffalo CRM - demo RAG embeddings',
  }

  const out: number[][] = []
  const BATCH = 32

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: batch.length === 1 ? batch[0] : batch,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenRouter embeddings ${res.status}: ${errText.slice(0, 500)}`)
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>
    }
    const items = [...(data.data || [])].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0)
    )
    if (items.length !== batch.length) {
      throw new Error(
        `OpenRouter embeddings: esperaba ${batch.length} vectores, recibí ${items.length}`
      )
    }
    for (const item of items) {
      if (!item.embedding?.length) {
        throw new Error('OpenRouter embeddings: vector vacío')
      }
      out.push(item.embedding)
    }
  }

  return out
}

export function parseJsonFromModelOutput(raw: string): unknown {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }
  try {
    return JSON.parse(s)
  } catch {
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(s.slice(start, end + 1))
    }
    throw new Error('No se pudo parsear JSON de la respuesta del modelo')
  }
}

