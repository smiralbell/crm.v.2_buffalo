const DEV_FALLBACK = 'default-secret-change-in-production'

/**
 * Clave con la que se firman sesiones y `state` de OAuth.
 * En producción es obligatoria: con la clave por defecto cualquiera podría fabricarse
 * una cookie de admin, así que preferimos que el login falle de forma visible.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim()
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET no está configurado. Añádelo en las variables de entorno del servidor.')
  }
  return DEV_FALLBACK
}

export function isSessionSecretConfigured(): boolean {
  return Boolean(process.env.SESSION_SECRET?.trim())
}
