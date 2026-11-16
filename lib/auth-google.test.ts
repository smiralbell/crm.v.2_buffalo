import { beforeEach, describe, expect, it, vi } from 'vitest'

const findCrmUserByEmail = vi.fn()
const verifyCrmUserPassword = vi.fn()
vi.mock('@/lib/crm-users', () => ({
  findCrmUserByEmail: (email: string) => findCrmUserByEmail(email),
  verifyCrmUserPassword: (email: string, password: string) => verifyCrmUserPassword(email, password),
}))

import { resolveGoogleLoginUser } from '@/lib/auth-google'
import { AdminGoogleOnlyError, authenticateCredentials } from '@/lib/auth'
import { googleOwnerKey } from '@/lib/integrations/google/owner'

describe('entrar con Google (solo admins)', () => {
  beforeEach(() => {
    findCrmUserByEmail.mockReset()
  })

  it('un socio admin dado de alta entra con su propio usuario', async () => {
    findCrmUserByEmail.mockResolvedValue({ id: 7, name: 'Santi', email: 'santi@gmail.com', role: 'admin' })
    const result = await resolveGoogleLoginUser('Santi@Gmail.com', 'Santiago G.')
    expect(result).toEqual({ user: { id: 7, email: 'santi@gmail.com', name: 'Santi', role: 'admin' } })
  })

  it('la cuenta de la agencia entra como administrador general', async () => {
    findCrmUserByEmail.mockResolvedValue(null)
    const result = await resolveGoogleLoginUser('agenciabuffaloo@gmail.com', 'Buffalo')
    expect(result).toMatchObject({ user: { id: 0, role: 'admin', email: 'agenciabuffaloo@gmail.com' } })
  })

  it('el equipo (developer, PM, comercial) no entra con Google', async () => {
    findCrmUserByEmail.mockResolvedValue({ id: 12, name: 'Laura', email: 'laura@gmail.com', role: 'developer' })
    const result = await resolveGoogleLoginUser('laura@gmail.com', 'Laura')
    expect(result).toHaveProperty('error')
  })

  it('un correo desconocido no entra', async () => {
    findCrmUserByEmail.mockResolvedValue(null)
    expect(await resolveGoogleLoginUser('desconocido@gmail.com', 'X')).toHaveProperty('error')
  })
})

describe('entrar con email y contraseña (solo el equipo)', () => {
  beforeEach(() => {
    verifyCrmUserPassword.mockReset()
  })

  it('un developer entra con su contraseña', async () => {
    verifyCrmUserPassword.mockResolvedValue({ id: 12, name: 'Laura', email: 'laura@gmail.com', role: 'developer' })
    expect(await authenticateCredentials('laura@gmail.com', 'secreto123')).toMatchObject({ id: 12, role: 'developer' })
  })

  it('un admin no puede entrar con contraseña', async () => {
    verifyCrmUserPassword.mockResolvedValue({ id: 7, name: 'Santi', email: 'santi@gmail.com', role: 'admin' })
    await expect(authenticateCredentials('santi@gmail.com', 'secreto123')).rejects.toBeInstanceOf(
      AdminGoogleOnlyError
    )
  })

  it('ya no hay admin por variables de entorno', async () => {
    process.env.CRM_ADMIN_EMAIL = 'admin@buffalo.ai'
    process.env.CRM_ADMIN_PASSWORD = 'clave-env'
    verifyCrmUserPassword.mockResolvedValue(null)
    expect(await authenticateCredentials('admin@buffalo.ai', 'clave-env')).toBeNull()
    delete process.env.CRM_ADMIN_EMAIL
    delete process.env.CRM_ADMIN_PASSWORD
  })
})

describe('conexiones de Google', () => {
  it('todos los admins usan las de la cuenta de la agencia', () => {
    const agency = 'admin:agenciabuffaloo@gmail.com'
    expect(googleOwnerKey({ id: 0, email: 'agenciabuffaloo@gmail.com', name: 'A', role: 'admin' })).toBe(agency)
    expect(googleOwnerKey({ id: 7, email: 'santi@gmail.com', name: 'S', role: 'admin' })).toBe(agency)
    expect(googleOwnerKey({ id: 8, email: 'sergi@gmail.com', name: 'S', role: 'admin' })).toBe(agency)
  })

  it('el resto, las suyas', () => {
    expect(googleOwnerKey({ id: 12, email: 'laura@gmail.com', name: 'L', role: 'developer' })).toBe('user:12')
  })
})
