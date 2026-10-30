import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { verifyAndStore } from '@/lib/retencion/mcp/api'
import { finishOAuth } from '@/lib/retencion/mcp/oauth'
import { getMcpServer, getMcpServerByState, patchMcpServer } from '@/lib/retencion/mcp/store'

/**
 * Vuelta del inicio de sesión OAuth de un conector MCP. Se abre en una ventana
 * emergente: avisa a la pantalla del CRM y se cierra sola.
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)
}

function page(res: NextApiResponse, payload: { ok: boolean; mensaje: string; proyectoId?: string }) {
  const back = payload.proyectoId ? `/retencion/proyectos/${payload.proyectoId}?tab=mcp` : '/retencion'
  const data = JSON.stringify({ type: 'buffalo-mcp-oauth', ok: payload.ok, mensaje: payload.mensaje }).replace(/</g, '\\u003c')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conector MCP</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#fafafa;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.card{max-width:420px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;text-align:center}
p{color:#4b5563;font-size:14px;line-height:1.5}a{color:#111;font-weight:600}</style></head>
<body><div class="card"><h1 style="font-size:17px">${payload.ok ? 'Conectado' : 'No se ha podido conectar'}</h1>
<p>${escapeHtml(payload.mensaje)}</p><p><a href="${back}">Volver al CRM</a></p></div>
<script>try{if(window.opener){window.opener.postMessage(${data},window.location.origin);setTimeout(function(){window.close()},${payload.ok ? 600 : 4000})}}catch(e){}</script>
</body></html>`)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = String(req.query.state || '')
  const code = String(req.query.code || '')
  const oauthError = String(req.query.error_description || req.query.error || '')

  try {
    const user = await requireAuthAPI(req, res)
    if (!state) return page(res, { ok: false, mensaje: 'Falta el parámetro state.' })
    const row = await getMcpServerByState(state)
    if (!row) return page(res, { ok: false, mensaje: 'Este inicio de sesión ya no es válido. Vuelve a pulsar Conectar.' })
    await assertProjectAccess(user, row.proyecto_id, res)
    if (res.headersSent) return
    if (user.role !== 'admin') return page(res, { ok: false, mensaje: 'Solo un admin puede conectar conectores.', proyectoId: row.proyecto_id })

    if (oauthError || !code) {
      await patchMcpServer(row.id, { oauth_state: null, oauth_verifier: null })
      return page(res, { ok: false, mensaje: oauthError || 'El servidor no ha devuelto el código de acceso.', proyectoId: row.proyecto_id })
    }

    await finishOAuth(row, code)
    // Con los tokens recién guardados se comprueba que sea de solo lectura; si no, se cierra la sesión.
    const withTokens = await getMcpServer(row.id)
    const result = withTokens ? await verifyAndStore(withTokens) : null
    if (result?.estado === 'conectado') {
      return page(res, { ok: true, mensaje: `${row.nombre} está conectado y es de solo lectura.`, proyectoId: row.proyecto_id })
    }
    return page(res, {
      ok: false,
      mensaje: result?.detalle || 'No se ha podido verificar el conector.',
      proyectoId: row.proyecto_id,
    })
  } catch (e) {
    if (res.headersSent) return
    return page(res, { ok: false, mensaje: e instanceof Error ? e.message : String(e) })
  }
}
