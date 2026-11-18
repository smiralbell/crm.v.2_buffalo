import { afterEach, describe, expect, it } from 'vitest'
import { isDriveAttachmentsConfigured, safeDriveName } from './drive-attachments'
import { contentDisposition } from '@/lib/tareas/attachments'

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe('safeDriveName', () => {
  it('quita barras y saltos de línea, y deja tildes y espacios', () => {
    expect(safeDriveName('Diseño / Logo\nfinal.png')).toBe('Diseño - Logo final.png')
  })
  it('si queda vacío usa el nombre por defecto', () => {
    expect(safeDriveName('   ', 'Sin nombre')).toBe('Sin nombre')
  })
  it('recorta nombres muy largos', () => {
    expect(safeDriveName('a'.repeat(400)).length).toBe(180)
  })
})

describe('isDriveAttachmentsConfigured', () => {
  it('hace falta la carpeta y la conexión de Drive', () => {
    delete process.env.GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'x'
    expect(isDriveAttachmentsConfigured()).toBe(false)
    process.env.GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID = '1AbC'
    expect(isDriveAttachmentsConfigured()).toBe(true)
    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN
    delete process.env.GOOGLE_REFRESH_TOKEN
    expect(isDriveAttachmentsConfigured()).toBe(false)
  })
})

describe('contentDisposition', () => {
  it('sirve el nombre con tildes para que se descargue bien', () => {
    const h = contentDisposition('Factura Diseño.pdf', false)
    expect(h).toContain('attachment;')
    expect(h).toContain("filename*=UTF-8''Factura%20Dise%C3%B1o.pdf")
    expect(contentDisposition('a.png', true)).toMatch(/^inline;/)
  })
})
