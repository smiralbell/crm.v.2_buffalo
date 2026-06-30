import { openRouterChatCompletion } from '@/lib/openrouter'
import type { DemoMessage } from './types'

const DEMO_MODEL = 'anthropic/claude-3.5-sonnet'

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

  return openRouterChatCompletion(messages, { model: DEMO_MODEL, temperature: 0.4 })
}
