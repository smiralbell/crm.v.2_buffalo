import jwt from 'jsonwebtoken'
import { getEnableBankingConfig } from './config'

const JWT_TTL_SECONDS = 3600

export function createEnableBankingJwt(): string {
  const { appId, privateKey } = getEnableBankingConfig()
  const now = Math.floor(Date.now() / 1000)

  return jwt.sign(
    {
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: now,
      exp: now + JWT_TTL_SECONDS,
    },
    privateKey,
    {
      algorithm: 'RS256',
      keyid: appId,
      header: { typ: 'JWT', alg: 'RS256', kid: appId },
    }
  )
}

export function validUntilIso(days = 90): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}
