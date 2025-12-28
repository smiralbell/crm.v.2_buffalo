import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface EditLeadProps {
  lead: {
    id: number
    contact_id: number | null
    estado: string
    valor: number | null
    notas: string | null
  }
  contacts: Array<{
    id: number
    nombre: string | null
    email: string | null
  }>
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

    const id = parseInt(context.params?.id as string)

    const [lead, contacts] = await Promise.all([
      prisma.lead.findUnique({
        where: { id },
      }),
      prisma.contact.findMany({
        select: {
          id: true,
          nombre: true,
          email: true,
        },
        orderBy: { nombre: 'asc' },
      }),
    ])

    if (!lead) {
      return {
        notFound: true,
      }
    }

    return {
      props: {
        lead: {
          ...lead,
          valor: lead.valor ? Number(lead.valor) : null,
        },
        contacts,
      },
    }
  } catch (error) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
}

export default function EditLead({ lead, contacts }: EditLeadProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    contact_id: lead.contact_id?.toString() || 'none',
    estado: lead.estado,
    valor: lead.valor?.toString() || '',
    notas: lead.notas || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const payload: any = {
        estado: formData.estado,
        notas: formData.notas || null,
      }

      if (formData.contact_id && formData.contact_id !== "none") {
        payload.contact_id = parseInt(formData.contact_id)
      } else {
        payload.contact_id = null
      }

      if (formData.valor) {
        payload.valor = parseFloat(formData.valor)
      } else {
        payload.valor = null
      }

      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al actualizar lead')
        setLoading(false)
        return
      }

      router.push(`/leads/${lead.id}`)
    } catch (err) {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/leads/${lead.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Editar Lead</h1>
            <p className="text-gray-600 mt-1">Modifica la información del lead</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Información del Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact_id">Contacto (Opcional)</Label>
                <Select
                  value={formData.contact_id || "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, contact_id: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar contacto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin contacto</SelectItem>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id.toString()}>
                        {contact.nombre || contact.email || `Contacto #${contact.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="estado">
                  Estado <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.estado}
                  onValueChange={(value) =>
                    setFormData({ ...formData, estado: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="frio">Frío</SelectItem>
                  <SelectItem value="caliente">Caliente</SelectItem>
                  <SelectItem value="cerrado">Cerrado</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor">Valor (€)</Label>
                <Input
                  id="valor"
                  name="valor"
                  type="number"
                  step="0.01"
                  value={formData.valor}
                  onChange={handleChange}
                  placeholder="0.00"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notas">Notas</Label>
                <Textarea
                  id="notas"
                  name="notas"
                  value={formData.notas}
                  onChange={handleChange}
                  rows={5}
                  disabled={loading}
                />
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <Link href={`/leads/${lead.id}`}>
              <Button type="button" variant="outline" disabled={loading}>
                Cancelar
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  )
}

