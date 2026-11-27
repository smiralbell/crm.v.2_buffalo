/**
 * Lee la respuesta JSON de la API. El CRM va detrás de Cloudflare: si el servidor no
 * responde a tiempo o se está reiniciando, llega una página HTML en vez de JSON. En ese
 * caso se explica qué pasa en lugar de enseñar el error técnico.
 */
export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    const busy = res.status === 502 || res.status === 503 || res.status === 504 || res.status === 520 || res.status === 522 || res.status === 524
    throw new Error(
      busy
        ? `El servidor no ha respondido a tiempo (HTTP ${res.status}). Puede que se esté desplegando o reiniciando: espera un momento y vuelve a intentarlo.`
        : `Respuesta inesperada del servidor (HTTP ${res.status}).`
    )
  }
}
