function env(name: string): string {
  return process.env[name]?.trim() || ''
}

export function isTelegramConfigured(): boolean {
  return Boolean(env('TELEGRAM_BOT_TOKEN') && telegramChatIds().length)
}

export function telegramChatIds(): string[] {
  const raw = env('TELEGRAM_CHAT_IDS') || env('TELEGRAM_CHAT_ID')
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = env('TELEGRAM_BOT_TOKEN')
  const chats = telegramChatIds()
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN')
  if (!chats.length) throw new Error('Falta TELEGRAM_CHAT_ID (o TELEGRAM_CHAT_IDS)')
  const errors: string[] = []
  for (const chatId of chats) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    if (!res.ok || !data.ok) {
      errors.push(`${chatId}: ${data.description || res.statusText || res.status}`)
    }
  }
  if (errors.length) throw new Error(errors.join(' · '))
}
