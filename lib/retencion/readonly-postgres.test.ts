import { describe, expect, it } from 'vitest'
import {
  explainPgConnectError,
  parsePgUrl,
  pgSslConfig,
  redactDbError,
} from './readonly-postgres'

describe('parsePgUrl', () => {
  it('entiende la URL externa de EasyPanel (IP, puerto publicado, sslmode=disable)', () => {
    const p = parsePgUrl(
      ' postgresql://postgres:s3cret@203.0.113.10:30123/pablo?sslmode=disable '
    )
    expect(p).toEqual({
      host: '203.0.113.10',
      port: 30123,
      user: 'postgres',
      password: 's3cret',
      database: 'pablo',
      sslmode: 'disable',
    })
  })

  it('sin sslmode asume disable (como EasyPanel)', () => {
    expect(parsePgUrl('postgres://u:p@db.example.com:5432/app').sslmode).toBe('disable')
  })
})

describe('pgSslConfig', () => {
  it('no fuerza TLS si EasyPanel trae sslmode=disable', () => {
    expect(pgSslConfig('postgres://u:p@panel.example.com/db?sslmode=disable')).toBeUndefined()
  })

  it('no fuerza TLS por defecto (EasyPanel)', () => {
    expect(pgSslConfig('postgres://u:p@localhost:5432/db')).toBeUndefined()
  })

  it('activa TLS solo si la URL pide sslmode=require', () => {
    expect(pgSslConfig('postgres://u:p@db.example.com/db?sslmode=require')).toEqual({
      rejectUnauthorized: false,
    })
  })
})

describe('explainPgConnectError', () => {
  it('apunta a la URL externa de EasyPanel si hay timeout', () => {
    const msg = explainPgConnectError(
      new Error('timeout expired'),
      'postgres://u:p@panel.example.com:25432/pablo'
    )
    expect(msg.toLowerCase()).toContain('externa')
    expect(msg).toContain('25432')
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
