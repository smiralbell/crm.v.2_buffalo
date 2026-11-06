import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/integrations/google/drive-auth', () => ({ getAuthorizedDriveClient: vi.fn() }))
vi.mock('@/lib/integrations/google/drive-invoices', () => ({ uploadInvoiceToDrive: vi.fn() }))

import { devInvoiceDriveFileName, invoiceYearMonth } from './invoice-drive'

describe('invoiceYearMonth', () => {
  it('usa el mes de la fecha de la factura, no el de hoy', () => {
    expect(invoiceYearMonth(new Date('2026-03-31T00:00:00.000Z'))).toBe('2026-03')
    expect(invoiceYearMonth(new Date('2026-12-01T00:00:00.000Z'))).toBe('2026-12')
  })
})

describe('devInvoiceDriveFileName', () => {
  it('pone el número y el nombre del developer', () => {
    expect(devInvoiceDriveFileName('DEV-2026-012-0003', 'Ana Pérez')).toBe(
      'DEV-2026-012-0003 - Ana Pérez.pdf'
    )
  })

  it('sin nombre, solo el número', () => {
    expect(devInvoiceDriveFileName('DEV-2026-012-0003', null)).toBe('DEV-2026-012-0003.pdf')
    expect(devInvoiceDriveFileName('DEV-2026-012-0003', '  ')).toBe('DEV-2026-012-0003.pdf')
  })
})
