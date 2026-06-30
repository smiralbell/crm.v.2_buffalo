import { openRouterChatCompletion } from '@/lib/openrouter'
import type { DemoMessage } from './types'

/** Modelo para demos — configurable en EasyPanel con DEMO_OPENROUTER_MODEL */
const DEMO_MODEL_PRIMARY =
  process.env.DEMO_OPENROUTER_MODEL ||
  '~anthropic/claude-sonnet-latest'

const DEMO_MODEL_FALLBACK = 'openai/gpt-4o-mini'

export async function generateDemoReply(
  systemPrompt: string,
  knowledgeBase: string,
  history: DemoMessage[],
  userMessage: string
): Promise<string> {
  const system = `${systemPrompt.trim()}

---

BASE DE CONOCIMIENTO DEL CLIENTE:
${knowledgeBase.trim()}

Responde en el mismo idioma que use el usuario. Sé conciso y útil. No inventes datos que no estén en la base de conocimiento; si no sabes algo, dilo con naturalidad.`

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system },
  ]

  for (const msg of history) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })
  }

  messages.push({ role: 'user', content: userMessage })

  try {
    return await openRouterChatCompletion(messages, {
      model: DEMO_MODEL_PRIMARY,
      temperature: 0.4,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    const isModelError =
      msg.includes('404') ||
      msg.includes('No endpoints found') ||
      msg.includes('not a valid model')

    if (!isModelError || DEMO_MODEL_PRIMARY === DEMO_MODEL_FALLBACK) {
      throw err
    }

    console.warn(
      `[demos/chat] Modelo ${DEMO_MODEL_PRIMARY} no disponible, usando ${DEMO_MODEL_FALLBACK}`
    )
    return openRouterChatCompletion(messages, {
      model: DEMO_MODEL_FALLBACK,
      temperature: 0.4,
    })
  }
}
