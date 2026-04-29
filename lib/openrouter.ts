type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function openRouterChatCompletion(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no está configurada')
  }

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
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
      temperature: 0.3,
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

export function parseJsonFromModelOutput(raw: string): unknown {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  return JSON.parse(s)
}
