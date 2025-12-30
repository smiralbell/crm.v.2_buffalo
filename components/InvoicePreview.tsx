import { format } from 'date-fns'

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
  clientCompanyName?: string
  clientEmail?: string
  clientAddress?: string
  clientTaxId?: string
  companyName?: string
  companyAddress?: string
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
  clientCompanyName,
  clientEmail,
  clientAddress,
  clientTaxId,
  companyName = 'BUFFALO AI',
  companyAddress,
  issueDate,
  dueDate,
  services,
  subtotal,
  iva,
  total,
  status = 'draft',
}: InvoicePreviewProps) {
  const logoUrl = '/buffalo-logo.png'

  return (
    <div 
      data-invoice-preview
      style={{ 
        width: '210mm', 
        minHeight: '297mm',
        maxHeight: '297mm',
        margin: '0',
        padding: '0',
        backgroundColor: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: '14px',
        lineHeight: '1.5',
        color: '#111827',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Contenedor principal con padding */}
      <div 
        style={{ 
          width: '100%',
          height: '297mm',
          minHeight: '297mm',
          maxHeight: '297mm',
          padding: '20mm 25mm 15mm 25mm',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '32px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            {/* Logo */}
            <div style={{ flex: '0 0 auto', minHeight: '90px', display: 'flex', alignItems: 'center' }}>
              <img
                src={logoUrl}
                alt="Buffalo AI Logo"
                style={{ 
                  maxWidth: '320px',
                  maxHeight: '90px',
                  height: 'auto',
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'block'
                }}
                crossOrigin="anonymous"
              />
            </div>
            {/* Número y fecha */}
            <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
              <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: '0 0 4px 0', lineHeight: '1.2' }}>
                FACTURA
              </h1>
              <p style={{ fontSize: '14px', color: '#4B5563', margin: '0 0 8px 0', lineHeight: '1.4' }}>
                Nº {invoiceNumber}
              </p>
              <p style={{ fontSize: '14px', fontWeight: '500', color: '#111827', margin: '8px 0 0 0', lineHeight: '1.4' }}>
                {format(new Date(issueDate), 'dd MMM yyyy')}
              </p>
            </div>
          </div>
        </div>

        {/* Información empresa y cliente */}
        <div style={{ display: 'flex', gap: '32px', marginBottom: '32px', flexShrink: 0 }}>
          {/* Emisor */}
          <div style={{ flex: '1', minWidth: '0', textAlign: 'left' }}>
            <h3 style={{ fontSize: '11px', fontWeight: '500', color: '#6B7280', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.4', textAlign: 'left' }}>
              Emisor
            </h3>
            <div style={{ fontSize: '14px', color: '#111827', lineHeight: '1.6', textAlign: 'left' }}>
              <p style={{ fontWeight: '600', fontSize: '16px', margin: '0 0 4px 0', lineHeight: '1.4' }}>{companyName}</p>
              <p style={{ color: '#4B5563', margin: '0 0 12px 0', lineHeight: '1.4' }}>Global Digital Solutions</p>
              <div style={{ marginTop: '12px' }}>
                {companyAddress ? (
                  <p style={{ color: '#4B5563', margin: '0 0 4px 0', lineHeight: '1.4' }}>{companyAddress}</p>
                ) : (
                  <>
                    <p style={{ color: '#4B5563', margin: '0 0 4px 0', lineHeight: '1.4' }}>C/ Provença 474, esc B, entr. 2ª</p>
                    <p style={{ color: '#4B5563', margin: '0 0 4px 0', lineHeight: '1.4' }}>Barcelona (08025), Barcelona, España</p>
                  </>
                )}
                <p style={{ color: '#4B5563', margin: '0 0 4px 0', lineHeight: '1.4' }}>CIF: B22944599</p>
                <p style={{ color: '#4B5563', margin: '0', lineHeight: '1.4' }}>admin@agenciabuffalo.es</p>
              </div>
            </div>
          </div>
          
          {/* Línea divisoria */}
          <div style={{ width: '1px', backgroundColor: '#D1D5DB', flexShrink: '0' }}></div>
          
          {/* Cliente */}
          <div style={{ flex: '1', minWidth: '0', textAlign: 'right' }}>
            <h3 style={{ fontSize: '11px', fontWeight: '500', color: '#6B7280', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.4', textAlign: 'right' }}>
              Cliente
            </h3>
            <div style={{ fontSize: '14px', color: '#111827', lineHeight: '1.6', textAlign: 'right' }}>
              <p style={{ fontWeight: '600', fontSize: '16px', margin: '0 0 4px 0', lineHeight: '1.4' }}>{clientName}</p>
              {clientCompanyName && (
                <p style={{ color: '#4B5563', margin: '0 0 4px 0', lineHeight: '1.4' }}>{clientCompanyName}</p>
              )}
              {clientAddress && (
                <p style={{ color: '#4B5563', margin: '0 0 4px 0', lineHeight: '1.4' }}>{clientAddress}</p>
              )}
              {clientEmail && (
                <p style={{ color: '#4B5563', margin: '0 0 4px 0', lineHeight: '1.4' }}>{clientEmail}</p>
              )}
              {clientTaxId && (
                <p style={{ color: '#4B5563', margin: '0', lineHeight: '1.4' }}>CIF/NIF: {clientTaxId}</p>
              )}
            </div>
          </div>
        </div>

        {/* Fecha de vencimiento */}
        {dueDate && (
          <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.4' }}>
              Fecha de Vencimiento
            </p>
            <p style={{ fontSize: '14px', fontWeight: '500', color: '#111827', margin: '0', lineHeight: '1.4' }}>
              {format(new Date(dueDate), 'dd MMM yyyy')}
            </p>
          </div>
        )}

        {/* Tabla de servicios - Diseño mejorado con padding uniforme */}
        <div style={{ marginBottom: '24px', flexShrink: 0 }}>
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            width: '100%', 
            borderBottom: '1px solid #D1D5DB', 
            paddingTop: '12px',
            paddingBottom: '12px',
            boxSizing: 'border-box', 
            margin: '0', 
          }}>
            <div style={{ width: '38%', paddingLeft: '12px', paddingRight: '12px', fontSize: '11px', fontWeight: '500', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.4', display: 'flex', alignItems: 'center', boxSizing: 'border-box', margin: '0' }}>
              Descripción
            </div>
            <div style={{ width: '12%', paddingLeft: '12px', paddingRight: '12px', fontSize: '11px', fontWeight: '500', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.4', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', margin: '0' }}>
              Cantidad
            </div>
            <div style={{ width: '18%', paddingLeft: '12px', paddingRight: '12px', fontSize: '11px', fontWeight: '500', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.4', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', boxSizing: 'border-box', margin: '0', whiteSpace: 'nowrap' }}>
              Precio Unit.
            </div>
            <div style={{ width: '12%', paddingLeft: '12px', paddingRight: '12px', fontSize: '11px', fontWeight: '500', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.4', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', boxSizing: 'border-box', margin: '0' }}>
              IVA
            </div>
            <div style={{ width: '20%', paddingLeft: '12px', paddingRight: '12px', fontSize: '11px', fontWeight: '500', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.4', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', boxSizing: 'border-box', margin: '0' }}>
              Total
            </div>
          </div>
          
          {/* Rows */}
          {services && services.length > 0 ? (
            services.map((service, index) => (
              <div 
                key={index} 
                style={{ 
                  display: 'flex', 
                  width: '100%', 
                  borderBottom: '1px solid #F3F4F6', 
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  boxSizing: 'border-box', 
                  margin: '0', 
                }}
              >
                <div style={{ width: '38%', paddingLeft: '12px', paddingRight: '12px', fontSize: '13px', color: '#111827', lineHeight: '1.4', display: 'flex', alignItems: 'center', boxSizing: 'border-box', margin: '0', wordWrap: 'break-word' }}>
                  {service.description || 'Sin descripción'}
                </div>
                <div style={{ width: '12%', paddingLeft: '12px', paddingRight: '12px', fontSize: '13px', color: '#374151', lineHeight: '1.4', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', margin: '0' }}>
                  {service.quantity || 0}
                </div>
                <div style={{ width: '18%', paddingLeft: '12px', paddingRight: '12px', fontSize: '13px', color: '#374151', lineHeight: '1.4', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', boxSizing: 'border-box', margin: '0', fontVariantNumeric: 'tabular-nums' }}>
                  {(service.price || 0).toLocaleString('es-ES', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} €
                </div>
                <div style={{ width: '12%', paddingLeft: '12px', paddingRight: '12px', fontSize: '13px', color: '#374151', lineHeight: '1.4', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', boxSizing: 'border-box', margin: '0' }}>
                  {service.tax || 0}%
                </div>
                <div style={{ width: '20%', paddingLeft: '12px', paddingRight: '12px', fontSize: '13px', fontWeight: '500', color: '#111827', lineHeight: '1.4', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', boxSizing: 'border-box', margin: '0', fontVariantNumeric: 'tabular-nums' }}>
                  {(service.total || 0).toLocaleString('es-ES', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} €
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: '#6B7280', lineHeight: '1.5' }}>
              No hay servicios añadidos
            </div>
          )}
        </div>

        {/* Totales */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px', flexShrink: 0, boxSizing: 'border-box' }}>
          <div style={{ width: '240px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', paddingBottom: '8px', lineHeight: '1.4', boxSizing: 'border-box', margin: '0' }}>
              <span style={{ fontSize: '13px', color: '#4B5563', lineHeight: '1.4', margin: '0', padding: '0' }}>Subtotal:</span>
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: '1.4', textAlign: 'right', margin: '0', padding: '0' }}>
                {subtotal.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', paddingBottom: '8px', lineHeight: '1.4', boxSizing: 'border-box', margin: '0' }}>
              <span style={{ fontSize: '13px', color: '#4B5563', lineHeight: '1.4', margin: '0', padding: '0' }}>IVA:</span>
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: '1.4', textAlign: 'right', margin: '0', padding: '0' }}>
                {iva.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', paddingBottom: '12px', marginTop: '8px', borderTop: '1px solid #D1D5DB', lineHeight: '1.4', boxSizing: 'border-box' }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#111827', lineHeight: '1.4', margin: '0', padding: '0' }}>Total:</span>
              <span style={{ fontSize: '18px', fontWeight: '700', color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: '1.4', textAlign: 'right', margin: '0', padding: '0' }}>
                {total.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </span>
            </div>
          </div>
        </div>

        {/* Información de pago */}
        <div style={{ marginBottom: '24px', paddingTop: '20px', borderTop: '1px solid #E5E7EB', flexShrink: 0 }}>
          <div style={{ fontSize: '13px', color: '#4B5563', lineHeight: '1.6' }}>
            <p style={{ fontWeight: '500', color: '#111827', margin: '0 0 6px 0', lineHeight: '1.4' }}>Información de pago</p>
            <p style={{ margin: '0 0 4px 0', lineHeight: '1.4' }}>Transferencia bancaria</p>
            <p style={{ margin: '0 0 4px 0', lineHeight: '1.4' }}>Banco CaixaBank</p>
            <p style={{ margin: '0 0 4px 0', lineHeight: '1.4' }}>Nombre: BUFFALO IA Global Digital Solutions</p>
            <p style={{ fontFamily: 'monospace', fontSize: '14px', color: '#111827', letterSpacing: '0.05em', margin: '0', lineHeight: '1.4' }}>
              ES16 2100 0795 1802 0064 1987
            </p>
          </div>
        </div>

        {/* Footer - Posicionado al final del documento */}
        <div 
          style={{ 
            marginTop: 'auto',
            paddingTop: '8px',
            borderTop: '1px solid #F3F4F6',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0', lineHeight: '1.4' }}>
            Buffalo AI - Global Digital Solutions | C/ Provença 474, esc B, entr. 2ª, Barcelona 08025
          </p>
        </div>
      </div>
    </div>
  )
}
