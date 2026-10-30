import {
  auth,
  discoverOAuthServerInfo,
  extractResourceMetadataUrl,
  type OAuthClientProvider,
} from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { crmPublicBaseUrl } from '@/lib/ops-alerts'
import {
  getOAuthClient,
  getOAuthTokens,
  newOAuthState,
  patchMcpServer,
  type McpServerRow,
  type OAuthClientInfo,
  type OAuthTokensStored,
} from './store'

/**
 * Inicio de sesión OAuth en servidores MCP, como hace Claude: descubre el servidor de
 * autorización, se identifica (documento de cliente publicado, registro automático o
 * cliente propio), PKCE, y guarda y refresca los tokens. El estado vive en la BD
 * porque el inicio y la vuelta del login son peticiones distintas.
 */

export const OAUTH_CALLBACK_PATH = '/api/retencion/mcp/oauth/callback'
export const CLIENT_METADATA_PATH = '/api/retencion/mcp/oauth/client-metadata'

export function oauthRedirectUrl(base = crmPublicBaseUrl()): string {
  return `${base}${OAUTH_CALLBACK_PATH}`
}

export function publishedClientId(base = crmPublicBaseUrl()): string {
  return `${base}${CLIENT_METADATA_PATH}`
}

/** Identidad pública del CRM como cliente OAuth (lo que en Claude es «Claude's published identity»). */
export function crmClientMetadata(base = crmPublicBaseUrl()): OAuthClientMetadata {
  return {
    client_name: 'Buffalo CRM',
    client_uri: base,
    redirect_uris: [oauthRedirectUrl(base)],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }
}

export class DbOAuthProvider implements OAuthClientProvider {
  authorizeUrl: URL | null = null

  constructor(
    private row: McpServerRow,
    private base = crmPublicBaseUrl()
  ) {}

  get redirectUrl(): string {
    return oauthRedirectUrl(this.base)
  }

  get clientMetadataUrl(): string | undefined {
    // El documento publicado solo vale con https; si no, se cae a registro automático.
    return this.row.oauth_client === 'published' && this.base.startsWith('https://') ? publishedClientId(this.base) : undefined
  }

  get clientMetadata(): OAuthClientMetadata {
    return crmClientMetadata(this.base)
  }

  async state(): Promise<string> {
    const state = newOAuthState()
    await this.patch({ oauth_state: state })
    return state
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return getOAuthClient(this.row) || undefined
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await this.patch({ oauth_client_info: info as OAuthClientInfo })
  }

  tokens(): OAuthTokens | undefined {
    return (getOAuthTokens(this.row) as OAuthTokens | null) || undefined
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.patch({ oauth_tokens: tokens as OAuthTokensStored })
  }

  redirectToAuthorization(url: URL): void {
    this.authorizeUrl = url
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await this.patch({ oauth_verifier: verifier })
  }

  codeVerifier(): string {
    if (!this.row.oauth_verifier) throw new Error('El inicio de sesión ha caducado. Vuelve a pulsar Conectar.')
    return this.row.oauth_verifier
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    const keepClient = this.row.oauth_client === 'custom'
    if (scope === 'all') await this.patch({ oauth_tokens: null, oauth_verifier: null, ...(keepClient ? {} : { oauth_client_info: null }) })
    if (scope === 'client' && !keepClient) await this.patch({ oauth_client_info: null })
    if (scope === 'tokens') await this.patch({ oauth_tokens: null })
    if (scope === 'verifier') await this.patch({ oauth_verifier: null })
  }

  private async patch(p: Parameters<typeof patchMcpServer>[1]): Promise<void> {
    const updated = await patchMcpServer(this.row.id, p)
    if (updated) this.row = updated
  }
}

/** Empieza el login: devuelve la URL a abrir, o null si ya hay sesión válida. */
export async function startOAuth(row: McpServerRow, base?: string): Promise<{ authorizeUrl: string | null }> {
  const provider = new DbOAuthProvider(row, base)
  const result = await auth(provider, { serverUrl: row.url })
  if (result === 'AUTHORIZED') return { authorizeUrl: null }
  if (!provider.authorizeUrl) throw new Error('El servidor no ha devuelto una página de inicio de sesión')
  return { authorizeUrl: provider.authorizeUrl.toString() }
}

/** Vuelta del login: cambia el código por tokens. */
export async function finishOAuth(row: McpServerRow, code: string, base?: string): Promise<void> {
  const provider = new DbOAuthProvider(row, base)
  const result = await auth(provider, { serverUrl: row.url, authorizationCode: code })
  if (result !== 'AUTHORIZED') throw new Error('No se ha podido completar el inicio de sesión')
  await patchMcpServer(row.id, { oauth_state: null, oauth_verifier: null })
}

export type DetectResult = {
  /** El servidor responde sin pedir credenciales. */
  abierto: boolean
  /** Pide inicio de sesión OAuth. */
  oauth: boolean
  servidor_autorizacion: string | null
  registro_automatico: boolean
  identidad_publicada: boolean
  /** Pide credenciales pero no anuncia OAuth: hacen falta cabeceras (API key, token…). */
  necesita_cabeceras: boolean
  error: string | null
}

/** Paso «Continuar» del asistente: mira qué autenticación pide el servidor. */
export async function detectAuth(url: string): Promise<DetectResult> {
  const out: DetectResult = {
    abierto: false,
    oauth: false,
    servidor_autorizacion: null,
    registro_automatico: false,
    identidad_publicada: false,
    necesita_cabeceras: false,
    error: null,
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'buffalo-crm', version: '1.0.0' } },
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    out.error = `No se puede contactar con el servidor: ${e instanceof Error ? e.message : String(e)}`
    return out
  }
  await res.body?.cancel().catch(() => {})

  if (res.status !== 401 && res.status !== 403) {
    out.abierto = res.ok
    if (!res.ok && res.status !== 405) out.error = `El servidor respondió ${res.status}`
    // Algunos servidores aceptan sin login pero también ofrecen OAuth: se mira igualmente.
  }

  try {
    const info = await discoverOAuthServerInfo(url, { resourceMetadataUrl: extractResourceMetadataUrl(res) })
    const md = info.authorizationServerMetadata
    if (md?.authorization_endpoint) {
      out.oauth = true
      out.servidor_autorizacion = new URL(info.authorizationServerUrl).host
      out.registro_automatico = Boolean(md.registration_endpoint)
      out.identidad_publicada = md.client_id_metadata_document_supported === true
    }
  } catch {
    // Sin metadatos OAuth.
  }

  if (!out.abierto && !out.oauth && (res.status === 401 || res.status === 403)) out.necesita_cabeceras = true
  if (out.oauth || out.necesita_cabeceras) out.error = null
  return out
}
