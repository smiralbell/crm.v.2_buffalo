export interface TicketUpdatedCallbackPayload {
  event: 'ticket.updated'
  ticket_id: string
  external_id: string | null
  project_ref: string | null
  status: string
  message: string
  updated_by: string
  updated_at: string
}

export interface TicketDeletedCallbackPayload {
  event: 'ticket.deleted'
  ticket_id: string
  external_id: string | null
  project_ref: string | null
  deleted_by: string
  deleted_at: string
}

export type TicketCallbackPayload =
  | TicketUpdatedCallbackPayload
  | TicketDeletedCallbackPayload

export async function notifyClientTicketUpdate(params: {
  callbackUrl: string | null | undefined
  callbackToken: string | null | undefined
  payload: TicketCallbackPayload
}): Promise<{ sent: boolean; error?: string }> {
  const { callbackUrl, callbackToken, payload } = params

  if (!callbackUrl?.trim()) {
    return { sent: false, error: 'El proyecto no tiene URL de callback configurada' }
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (callbackToken?.trim()) {
      headers.Authorization = `Bearer ${callbackToken.trim()}`
    }

    const res = await fetch(callbackUrl.trim(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { sent: false, error: `Callback respondió ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}` }
    }

    return { sent: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al notificar al cliente'
    return { sent: false, error: msg }
  }
}
