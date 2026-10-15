import { describe, expect, it } from 'vitest'
import { pgSslConfig, redactDbError } from './readonly-postgres'

describe('pgSslConfig', () => {
  it('activa TLS en hosts remotos aunque no traigan sslmode', () => {
    expect(pgSslConfig('postgres://u:p@panel.example.com:5432/db')).toEqual({
      rejectUnauthorized: false,
    })
  })

  it('no fuerza TLS en localhost', () => {
    expect(pgSslConfig('postgres://u:p@localhost:5432/db')).toBeUndefined()
  })

  it('respeta sslmode=disable', () => {
    expect(pgSslConfig('postgres://u:p@panel.example.com/db?sslmode=disable')).toBeUndefined()
  })
})

describe('redactDbError', () => {
  it('oculta usuario y clave de la URL', () => {
    const msg = redactDbError(
      new Error('connect postgres://user:supersecret@host.example/db failed')
    )
    expect(msg).not.toContain('supersecret')
    expect(msg).toContain('postgres://***@')
  })
})
