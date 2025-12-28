import { Card } from '@/components/ui/card'
import { format } from 'date-fns'
import { useState, useEffect } from 'react'

interface Service {
  description: string
  quantity: number
  price: number
  tax: number
  total: number
}

interface InvoicePreviewProps {
  invoiceNumber: string
  clientName: string
  clientEmail?: string
  clientAddress?: string
  clientTaxId?: string
  issueDate: string
  dueDate?: string
  services: Service[]
  subtotal: number
  iva: number
  total: number
  status?: string
}

export default function InvoicePreview({
  invoiceNumber,
  clientName,
  clientEmail,
  clientAddress,
  clientTaxId,
  issueDate,
  dueDate,
  services,
  subtotal,
  iva,
  total,
  status = 'draft',
}: InvoicePreviewProps) {
  const [logoBase64, setLogoBase64] = useState<string>('')
  const logoUrl = 'https://agenciabuffalo.es/wp-content/uploads/2025/10/Generated_Image_September_25__2025_-_11_16AM-removebg-preview.png'

  // Convertir logo a base64 para que se vea en el PDF
  useEffect(() => {
    const convertLogo = async () => {
      try {
        const response = await fetch(logoUrl)
        const blob = await response.blob()
        const reader = new FileReader()
        reader.onloadend = () => {
          setLogoBase64(reader.result as string)
        }
        reader.readAsDataURL(blob)
      } catch (error) {
        console.error('Error loading logo:', error)
        // Usar la URL directamente si falla la conversión
        setLogoBase64(logoUrl)
      }
    }
    convertLogo()
  }, [])

  return (
    <div className="bg-white" style={{ width: '210mm', minHeight: '297mm' }}>
      {/* Hoja A4 - tamaño real con márgenes adecuados */}
      <div className="bg-white" style={{ width: '210mm', minHeight: '297mm', padding: '20mm 15mm' }}>
        {/* Header con logo y número de factura */}
        <div className="border-b-2 border-gray-300 pb-6 mb-6">
          <div className="flex justify-between items-start">
            {/* Logo - Izquierda */}
            <div>
              {logoBase64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoBase64}
                  alt="Buffalo AI Logo"
                  className="h-20"
                  style={{ maxWidth: '250px', objectFit: 'contain' }}
                  crossOrigin="anonymous"
                />
              )}
            </div>
            {/* Factura y número - Derecha */}
            <div className="text-right">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">FACTURA</h2>
              <p className="text-lg font-semibold text-gray-700">Nº {invoiceNumber}</p>
            </div>
          </div>
        </div>

        {/* Información empresa y cliente - Lado a lado */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Datos empresa - Izquierda */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 text-sm uppercase">De:</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p className="font-bold text-base">BUFFALO AI, GLOBAL DIGITAL</p>
              <p className="font-semibold">SOLUTIONS</p>
              <p>C/ Provença 474, esc B, entr. 2ª</p>
              <p>Barcelona (08025), Barcelona,</p>
              <p>España</p>
              <p>B22944599</p>
              <p>admin@agenciabuffalo.es</p>
            </div>
          </div>
          {/* Datos cliente - Derecha */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 text-sm uppercase">Para:</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p className="font-semibold text-base">{clientName}</p>
              {clientAddress && <p>{clientAddress}</p>}
              {clientTaxId && <p>CIF/NIF: {clientTaxId}</p>}
              {clientEmail && <p>Email: {clientEmail}</p>}
            </div>
          </div>
        </div>

        {/* Fechas */}
        <div className="grid grid-cols-2 gap-8 mb-8 pb-6 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-500 mb-1">Fecha de Emisión</p>
            <p className="text-sm font-medium text-gray-900">
              {format(new Date(issueDate), 'dd MMM yyyy')}
            </p>
          </div>
          {dueDate && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Fecha de Vencimiento</p>
              <p className="text-sm font-medium text-gray-900">
                {format(new Date(dueDate), 'dd MMM yyyy')}
              </p>
            </div>
          )}
        </div>

        {/* Tabla de servicios */}
        <div className="mb-8">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Descripción</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-900">Cantidad</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">Precio Unit.</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">IVA</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">Total</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="py-3 px-4 text-sm text-gray-700">{service.description}</td>
                  <td className="py-3 px-4 text-sm text-center text-gray-700">{service.quantity}</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-700">
                    {service.price.toLocaleString('es-ES', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} €
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-gray-700">{service.tax}%</td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-gray-900">
                    {service.total.toLocaleString('es-ES', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="flex justify-end mb-8">
          <div className="w-64">
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-sm text-gray-600">Subtotal:</span>
              <span className="text-sm font-medium text-gray-900">
                {subtotal.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-sm text-gray-600">IVA:</span>
              <span className="text-sm font-medium text-gray-900">
                {iva.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </span>
            </div>
            <div className="flex justify-between py-3 mt-2">
              <span className="text-lg font-bold text-gray-900">TOTAL:</span>
              <span className="text-lg font-bold text-gray-900">
                {total.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </span>
            </div>
          </div>
        </div>

        {/* Condiciones de pago */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-sm text-gray-700 space-y-2">
            <p className="font-semibold">Condiciones de pago</p>
            <p>Pagar por transferencia bancaria al siguiente número de cuenta:</p>
            <p className="font-mono font-semibold text-base">ES16 2100 0795 1802 0064 1987</p>
          </div>
          {status === 'draft' && (
            <div className="mt-4">
              <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                BORRADOR
              </span>
            </div>
          )}
          {status === 'sent' && (
            <div className="mt-4">
              <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                ENVIADA
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

