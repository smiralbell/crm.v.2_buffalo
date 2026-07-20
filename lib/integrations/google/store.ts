import { prisma } from '@/lib/prisma'
import { decryptSecret, encryptSecret } from '@/lib/integrations/google/crypto'

export type GoogleConnectionRow = {
  id: string
  owner_key: string
  google_email: string | null
  access_token_enc: string
  refresh_token_enc: string | null
  expiry_date: Date | null
  scopes: string | null
  needs_reauth: boolean
}

export async function ensureGoogleConnectionsTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS google_calendar_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_key TEXT NOT NULL UNIQUE,
      google_email TEXT,
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT,
      expiry_date TIMESTAMPTZ,
      scopes TEXT,
      needs_reauth BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function getConnectionByOwner(
  ownerKey: string
): Promise<GoogleConnectionRow | null> {
  const rows = await prisma.$queryRaw<GoogleConnectionRow[]>`
    SELECT id, owner_key, google_email, access_token_enc, refresh_token_enc,
           expiry_date, scopes, needs_reauth
    FROM google_calendar_connections
    WHERE owner_key = ${ownerKey}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function upsertGoogleTokens(input: {
  ownerKey: string
  googleEmail: string | null
  accessToken: string
  refreshToken: string | null
  expiryDate: Date | null
  scopes: string | null
}): Promise<void> {
  await ensureGoogleConnectionsTable()
  const accessEnc = encryptSecret(input.accessToken)
  const existing = await getConnectionByOwner(input.ownerKey)

  // No sobrescribir refresh_token si Google no envía uno nuevo
  let refreshEnc: string | null
  if (input.refreshToken) {
    refreshEnc = encryptSecret(input.refreshToken)
  } else if (existing?.refresh_token_enc) {
    refreshEnc = existing.refresh_token_enc
  } else {
    refreshEnc = null
  }

  if (!refreshEnc && !existing?.refresh_token_enc) {
    throw new Error(
      'Google no devolvió refresh_token. Revoca el acceso de la app en tu cuenta Google y vuelve a conectar con consentimiento.'
    )
  }

  await prisma.$executeRaw`
    INSERT INTO google_calendar_connections (
      owner_key, google_email, access_token_enc, refresh_token_enc,
      expiry_date, scopes, needs_reauth, created_at, updated_at
    ) VALUES (
      ${input.ownerKey},
      ${input.googleEmail},
      ${accessEnc},
      ${refreshEnc},
      ${input.expiryDate},
      ${input.scopes},
      FALSE,
      NOW(),
      NOW()
    )
    ON CONFLICT (owner_key) DO UPDATE SET
      google_email = EXCLUDED.google_email,
      access_token_enc = EXCLUDED.access_token_enc,
      refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, google_calendar_connections.refresh_token_enc),
      expiry_date = EXCLUDED.expiry_date,
      scopes = COALESCE(EXCLUDED.scopes, google_calendar_connections.scopes),
      needs_reauth = FALSE,
      updated_at = NOW()
  `
}

export async function updateAccessToken(
  ownerKey: string,
  accessToken: string,
  expiryDate: Date | null,
  newRefreshToken?: string | null
): Promise<void> {
  const accessEnc = encryptSecret(accessToken)
  if (newRefreshToken) {
    const refreshEnc = encryptSecret(newRefreshToken)
    await prisma.$executeRaw`
      UPDATE google_calendar_connections
      SET access_token_enc = ${accessEnc},
          refresh_token_enc = ${refreshEnc},
          expiry_date = ${expiryDate},
          needs_reauth = FALSE,
          updated_at = NOW()
      WHERE owner_key = ${ownerKey}
    `
  } else {
    await prisma.$executeRaw`
      UPDATE google_calendar_connections
      SET access_token_enc = ${accessEnc},
          expiry_date = ${expiryDate},
          needs_reauth = FALSE,
          updated_at = NOW()
      WHERE owner_key = ${ownerKey}
    `
  }
}

export async function markNeedsReauth(ownerKey: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE google_calendar_connections
    SET needs_reauth = TRUE, updated_at = NOW()
    WHERE owner_key = ${ownerKey}
  `
}

export async function deleteConnection(ownerKey: string): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM google_calendar_connections WHERE owner_key = ${ownerKey}
  `
}

export function decryptConnectionTokens(row: GoogleConnectionRow): {
  accessToken: string
  refreshToken: string | null
} {
  return {
    accessToken: decryptSecret(row.access_token_enc),
    refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : null,
  }
}
