export const field =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200'

export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'No se pudo completar')
  return j as T
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
export const Lbl = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-1 block text-xs font-medium text-gray-600">{children}</span>
)
export const ErrorBox = ({ text }: { text: string | null }) =>
  text ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{text}</p> : null
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const shortDay = (s: string | null) =>
  s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''
