import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { ArrowLeft, Edit, FileText, Download } from 'lucide-react'
import { format } from 'date-fns'
import { useRef, useEffect } from 'react'
import InvoicePreview from '@/components/InvoicePreview'

interface Service {
  description: string
  quantity: number
  price: number
  tax: number
  total: number
}

interface InvoiceDetailProps {
  invoice: {
    id: number
    invoice_number: string
    status: string
    client_name: string
    client_address: string | null
    client_tax_id: string | null
    client_email: string | null
    company_address: string | null
    subtotal: number
    iva: number
    total: number
    issue_date: string
    due_date: string | null
    services: Service[]
    pdf_drive_url: string | null
    created_at: string
  }
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch (error) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  try {
    const id = parseInt(context.params?.id as string)
    
    // Redirigir siempre a la página de edición
    return {
      redirect: {
        destination: `/invoices/${id}/edit`,
        permanent: false,
      },
    }
  } catch (error: any) {
    return {
      redirect: {
        destination: '/invoices',
        permanent: false,
      },
    }
  }
}

export default function InvoiceDetail() {
  const router = useRouter()

  // Función para descargar PDF
  const handleDownloadPDF = async () => {
    if (!invoicePreviewRef.current) return

    try {
      // Importar html2pdf solo en el cliente (dinámicamente)
      const html2pdf = (await import('html2pdf.js')).default

      const element = invoicePreviewRef.current
      if (!element) return

      const opt = {
        margin: [0, 0, 0, 0],
        filename: `factura-${invoice.invoice_number}.pdf`,
        image: { type: 'png' as const, quality: 1.0 },
        html2canvas: { 
          scale: 3,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          letterRendering: true,
          precision: 2,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
          removeContainer: true,
          foreignObjectRendering: true,
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait' as const,
          compress: true,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      }

      await html2pdf().set(opt).from(element).save()
    } catch (error) {
      console.error('Error al generar PDF:', error)
      alert('Error al generar el PDF. Por favor, intenta de nuevo.')
    }
  }

  // Auto-descargar si viene el parámetro download
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('download') === 'true') {
        const timer = setTimeout(() => {
          handleDownloadPDF()
          // Limpiar el parámetro de la URL
          router.replace(`/invoices/${invoice.id}`, undefined, { shallow: true })
        }, 1000)
        return () => clearTimeout(timer)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.download, invoice.id])

  const statusLabels: { [key: string]: string } = {
    draft: 'Borrador',
    sent: 'Enviada',
    cancelled: 'Cancelada',
  }

  const statusColors: { [key: string]: string } = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  return null
}

