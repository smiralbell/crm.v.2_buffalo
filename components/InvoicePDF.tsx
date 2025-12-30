import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { format } from 'date-fns'

interface Service {
  description: string
  quantity: number
  price: number
  tax: number
  total: number
}

interface InvoicePDFProps {
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
  logoUrl?: string
}

// Estilos para el PDF
const styles = StyleSheet.create({
  page: {
    padding: '20mm 25mm 20mm 25mm',
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: -8,
  },
  logo: {
    width: 240,
    height: 72,
    marginBottom: 0,
    marginTop: -8,
  },
  invoiceInfo: {
    textAlign: 'right',
    flex: 1,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexDirection: 'column',
  },
  invoiceTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#000000',
  },
  invoiceNumber: {
    fontSize: 10,
    marginBottom: 3,
    color: '#666666',
  },
  invoiceDate: {
    fontSize: 10,
    color: '#333333',
  },
  companyInfo: {
    fontSize: 0,
    lineHeight: 0,
    display: 'none',
  },
  companyName: {
    display: 'none',
  },
  companySubtitle: {
    display: 'none',
  },
  companyDetail: {
    display: 'none',
  },
  clientSection: {
    marginBottom: 24,
    flexDirection: 'row',
    gap: 24,
  },
  clientColumn: {
    flex: 1,
  },
  clientLabel: {
    fontSize: 9,
    fontWeight: 'medium',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  clientName: {
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 3,
    lineHeight: 1.4,
  },
  clientDetail: {
    color: '#4B5563',
    marginBottom: 2,
    fontSize: 10,
    lineHeight: 1.5,
  },
  divider: {
    width: 1,
    backgroundColor: '#D1D5DB',
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1px solid #D1D5DB',
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#F9FAFB',
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#4B5563',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1px solid #F3F4F6',
    paddingTop: 8,
    paddingBottom: 8,
  },
  tableCell: {
    fontSize: 10,
    color: '#111827',
    fontWeight: 'normal',
  },
  colDesc: { width: '31%', paddingLeft: 8, paddingRight: 8 },
  colQty: { width: '14%', paddingLeft: 8, paddingRight: 8, textAlign: 'center' },
  colPrice: { width: '20%', paddingLeft: 8, paddingRight: 8, textAlign: 'right' },
  colTax: { width: '12%', paddingLeft: 8, paddingRight: 8, textAlign: 'center' },
  colTotal: { width: '23%', paddingLeft: 8, paddingRight: 0, textAlign: 'right', fontWeight: 'normal' },
  totals: {
    marginTop: 0,
    marginBottom: 6,
    alignItems: 'flex-end',
  },
  totalsContainer: {
    width: 200,
    paddingRight: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 6,
    fontSize: 10,
  },
  totalLabel: {
    color: '#4B5563',
  },
  totalValue: {
    color: '#111827',
    fontWeight: 'normal',
  },
  totalRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 6,
    marginTop: 6,
    borderTop: '1px solid #D1D5DB',
    fontSize: 13,
    fontWeight: 'bold',
  },
  paymentInfo: {
    marginTop: 30,
    paddingTop: 16,
    borderTop: '1px solid #E5E7EB',
    fontSize: 10,
    color: '#4B5563',
    lineHeight: 1.6,
  },
  paymentTitle: {
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    fontSize: 10,
  },
  paymentDetail: {
    marginBottom: 4,
    fontSize: 10,
    color: '#4B5563',
    lineHeight: 1.5,
  },
  accountNumber: {
    fontSize: 10,
    color: '#111827',
    letterSpacing: 0.3,
    fontFamily: 'Helvetica',
    fontWeight: 'normal',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
    borderTop: '1px solid #F3F4F6',
    textAlign: 'center',
    fontSize: 8,
    color: '#9CA3AF',
  },
})

export const InvoicePDF = ({
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
  logoUrl = '/buffalo-logo.png',
}: InvoicePDFProps) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image src={logoUrl} style={styles.logo} />
          </View>
          <View style={styles.invoiceInfo}>
            <Text style={styles.invoiceTitle}>FACTURA</Text>
            <Text style={styles.invoiceNumber}>Nº {invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>{format(new Date(issueDate), 'dd MMM yyyy')}</Text>
          </View>
        </View>

        {/* Cliente y Emisor */}
        <View style={styles.clientSection}>
          <View style={styles.clientColumn}>
            <Text style={styles.clientLabel}>Emisor</Text>
            <Text style={styles.clientName}>{companyName}</Text>
            <Text style={styles.clientDetail}>Global Digital Solutions</Text>
            {companyAddress ? (
              <Text style={styles.clientDetail}>{companyAddress}</Text>
            ) : (
              <>
                <Text style={styles.clientDetail}>C/ Provença 474, esc B, entr. 2ª</Text>
                <Text style={styles.clientDetail}>Barcelona (08025), Barcelona, España</Text>
              </>
            )}
            <Text style={styles.clientDetail}>CIF: B22944599</Text>
            <Text style={styles.clientDetail}>admin@agenciabuffalo.es</Text>
          </View>
          <View style={styles.divider} />
          <View style={[styles.clientColumn, { alignItems: 'flex-end' }]}>
            <Text style={[styles.clientLabel, { textAlign: 'right' }]}>Cliente</Text>
            <Text style={[styles.clientName, { textAlign: 'right' }]}>{clientName}</Text>
            {clientCompanyName && <Text style={[styles.clientDetail, { textAlign: 'right' }]}>{clientCompanyName}</Text>}
            {clientAddress && <Text style={[styles.clientDetail, { textAlign: 'right' }]}>{clientAddress}</Text>}
            {clientEmail && <Text style={[styles.clientDetail, { textAlign: 'right' }]}>{clientEmail}</Text>}
            {clientTaxId && <Text style={[styles.clientDetail, { textAlign: 'right' }]}>CIF/NIF: {clientTaxId}</Text>}
          </View>
        </View>

        {/* Tabla de servicios */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Descripción</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Cantidad</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Precio Unit.</Text>
            <Text style={[styles.tableHeaderCell, styles.colTax]}>IVA</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
          </View>
          {services && services.length > 0 ? (
            services.map((service, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.colDesc]}>{service.description || 'Sin descripción'}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>{service.quantity || 0}</Text>
                <Text style={[styles.tableCell, styles.colPrice]}>
                  {(service.price || 0).toLocaleString('es-ES', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} €
                </Text>
                <Text style={[styles.tableCell, styles.colTax]}>{service.tax || 0}%</Text>
                <Text style={[styles.tableCell, styles.colTotal]}>
                  {(service.total || 0).toLocaleString('es-ES', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} €
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '100%', textAlign: 'center', padding: 16 }]}>
                No hay servicios añadidos
              </Text>
            </View>
          )}
        </View>

        {/* Totales */}
        <View style={styles.totals}>
          <View style={styles.totalsContainer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal:</Text>
              <Text style={styles.totalValue}>
                {subtotal.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>IVA:</Text>
              <Text style={styles.totalValue}>
                {iva.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </Text>
            </View>
            <View style={styles.totalRowFinal}>
              <Text>Total:</Text>
              <Text>
                {total.toLocaleString('es-ES', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </Text>
            </View>
          </View>
        </View>

        {/* Información de pago */}
        <View style={styles.paymentInfo}>
          <Text style={styles.paymentTitle}>Información de pago</Text>
          <Text style={styles.paymentDetail}>Transferencia bancaria Banco CaixaBank</Text>
          <Text style={styles.paymentDetail}>Nombre: BUFFALO IA Global Digital Solutions</Text>
          <Text style={styles.paymentDetail}>Número de cuenta: <Text style={styles.accountNumber}>ES16 2100 0795 1802 0064 1987</Text></Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Buffalo AI - Global Digital Solutions | C/ Provença 474, esc B, entr. 2ª, Barcelona 08025</Text>
        </View>
      </Page>
    </Document>
  )
}

