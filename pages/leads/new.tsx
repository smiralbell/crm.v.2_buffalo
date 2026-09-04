import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, User, Briefcase } from 'lucide-react'
import Link from 'next/link'
import { LEAD_ESTADO_OPTIONS } from '@/lib/leads/estados'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
    return { props: {} }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}

export default function NewLead() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    // Contact fields
    nombre: '',
    email: '',
    empresa: '',
    telefono: '',
    ciudad: '',
    // Lead fields
    estado: 'frio',
    valor: '',
    prioridad: 'media',
  })

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    set(e.target.name, e.target.value)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio')
      return
    }

    setLoading(true)

    try {
      // Step 1: create contact
      const contactRes = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          email: form.email.trim() || undefined,
          empresa: form.empresa.trim() || undefined,
          telefono: form.telefono.trim() || undefined,
          ciudad: form.ciudad.trim() || undefined,
        }),
      })

      let contactId: number

      if (contactRes.status === 409) {
        // Email already exists — reuse that contact
        const dup = await contactRes.json()
        if (dup.contactId) {
          contactId = dup.contactId
        } else {
          setError('Ya existe un contacto con ese email. Usa uno diferente.')
          setLoading(false)
          return
        }
      } else if (!contactRes.ok) {
        const err = await contactRes.json().catch(() => ({}))
        setError(err.error || 'Error al crear el contacto')
        setLoading(false)
        return
      } else {
        const contact = await contactRes.json()
        contactId = contact.id
      }

      // Step 2: create lead linked to that contact
      const leadRes = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          estado: form.estado,
          valor: form.valor ? parseFloat(form.valor) : undefined,
          prioridad: form.prioridad,
        }),
      })

      if (!leadRes.ok) {
        const err = await leadRes.json().catch(() => ({}))
        // P2002 unique — contact already has a lead
        if (err.error?.includes('Unique') || err.error?.includes('unique') || leadRes.status === 409) {
          setError('Este contacto ya tiene un lead asignado. Búscalo en la lista de leads.')
        } else {
          setError(err.error || 'Error al crear el lead')
        }
        setLoading(false)
        return
      }

      const lead = await leadRes.json()
      router.push(`/leads/${lead.id}`)
    } catch {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/leads">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contact block */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Datos del contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nombre">
                    Nombre <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="nombre"
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    placeholder="Juan García"
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="juan@empresa.com"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="empresa">Empresa</Label>
                  <Input
                    id="empresa"
                    name="empresa"
                    value={form.empresa}
                    onChange={handleChange}
                    placeholder="Acme S.L."
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    name="telefono"
                    value={form.telefono}
                    onChange={handleChange}
                    placeholder="+34 600 000 000"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-1.5 max-w-xs">
                <Label htmlFor="ciudad">Ciudad</Label>
                <Input
                  id="ciudad"
                  name="ciudad"
                  value={form.ciudad}
                  onChange={handleChange}
                  placeholder="Madrid"
                  disabled={loading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Lead block */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="h-4 w-4 text-gray-500" />
                Datos del lead
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={form.estado} onValueChange={(v) => set('estado', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_ESTADO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Prioridad</Label>
                  <Select value={form.prioridad} onValueChange={(v) => set('prioridad', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baja">Baja</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="valor">Valor (€)</Label>
                  <Input
                    id="valor"
                    name="valor"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.valor}
                    onChange={handleChange}
                    placeholder="0.00"
                    disabled={loading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Link href="/leads">
              <Button type="button" variant="outline" disabled={loading}>
                Cancelar
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creando...' : 'Crear Lead'}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  )
}
