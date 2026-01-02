import { useRouter } from 'next/router'
import { useState } from 'react'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Mail, Edit, Instagram } from 'lucide-react'
import Link from 'next/link'

export default function NewContact() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [duplicateEmail, setDuplicateEmail] = useState('')
  const [duplicateContactId, setDuplicateContactId] = useState<number | null>(null)
  const [duplicateField, setDuplicateField] = useState<'email' | 'instagram' | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    empresa: '',
    instagram_user: '',
    direccion_fiscal: '',
    ciudad: '',
    codigo_postal: '',
    pais: '',
    cif: '',
    dni: '',
    iban: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        // Si es un error de campo duplicado (409), mostrar el diálogo
        if (res.status === 409) {
          const errorMessage = data.error || ''
          const isEmailError = errorMessage.toLowerCase().includes('email') || 
                               errorMessage.toLowerCase().includes('correo')
          const isInstagramError = errorMessage.toLowerCase().includes('instagram')
          
          if (isEmailError || isInstagramError) {
            setDuplicateField(isEmailError ? 'email' : 'instagram')
            setDuplicateEmail(isEmailError ? formData.email : formData.instagram_user || '')
            // Asegurar que contactId sea un número válido
            const contactId = data.contactId ? Number(data.contactId) : null
            setDuplicateContactId(contactId)
            setShowEmailDialog(true)
            setLoading(false)
            return
          }
        }
        // Para otros errores, mostrar el mensaje normal
        setError(data.error || 'Error al crear contacto')
        setLoading(false)
        return
      }

      router.push(`/contacts/${data.id}`)
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
          <Link href="/contacts">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Nuevo Contacto</h1>
            <p className="text-gray-600 mt-1">Crea un nuevo contacto en el CRM</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Información Básica */}
            <Card>
              <CardHeader>
                <CardTitle>Información Básica</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">
                    Nombre <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="nombre"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleChange}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empresa">Empresa</Label>
                  <Input
                    id="empresa"
                    name="empresa"
                    value={formData.empresa}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instagram_user">Instagram</Label>
                  <Input
                    id="instagram_user"
                    name="instagram_user"
                    value={formData.instagram_user}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Información Fiscal */}
            <Card>
              <CardHeader>
                <CardTitle>Información Fiscal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="direccion_fiscal">Dirección Fiscal</Label>
                  <Textarea
                    id="direccion_fiscal"
                    name="direccion_fiscal"
                    value={formData.direccion_fiscal}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ciudad">Ciudad</Label>
                  <Input
                    id="ciudad"
                    name="ciudad"
                    value={formData.ciudad}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="codigo_postal">Código Postal</Label>
                  <Input
                    id="codigo_postal"
                    name="codigo_postal"
                    value={formData.codigo_postal}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pais">País</Label>
                  <Input
                    id="pais"
                    name="pais"
                    value={formData.pais}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cif">CIF</Label>
                  <Input
                    id="cif"
                    name="cif"
                    value={formData.cif}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dni">DNI</Label>
                  <Input
                    id="dni"
                    name="dni"
                    value={formData.dni}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    name="iban"
                    value={formData.iban}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {error && (
            <div className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-4">
            <Link href="/contacts">
              <Button type="button" variant="outline" disabled={loading}>
                Cancelar
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creando...' : 'Crear Contacto'}
            </Button>
          </div>
        </form>

        {/* Diálogo de email duplicado */}
        <AlertDialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                  {duplicateField === 'email' ? (
                    <Mail className="h-5 w-5 text-red-600" />
                  ) : (
                    <Instagram className="h-5 w-5 text-red-600" />
                  )}
                </div>
                <AlertDialogTitle className="text-xl">
                  {duplicateField === 'email' 
                    ? 'Email ya registrado' 
                    : 'Usuario de Instagram ya registrado'}
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-base pt-2">
                Ya existe un contacto con este {duplicateField === 'email' ? 'correo electrónico' : 'usuario de Instagram'}:
                <span className="font-semibold text-gray-900 block mt-2 px-3 py-2 bg-gray-50 rounded-md">
                  {duplicateEmail}
                </span>
                <p className="mt-4 text-sm text-gray-600">
                  {duplicateContactId 
                    ? `Puedes ir a editar el contacto existente o utilizar un ${duplicateField === 'email' ? 'email' : 'usuario de Instagram'} diferente para crear uno nuevo.`
                    : `Por favor, verifica el ${duplicateField === 'email' ? 'email' : 'usuario de Instagram'} o utiliza uno diferente para crear el contacto.`}
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3">
              {duplicateContactId ? (
                <Button
                  onClick={() => {
                    setShowEmailDialog(false)
                    router.push(`/contacts/${duplicateContactId}/edit`)
                  }}
                  className="w-full sm:w-auto order-2 sm:order-1"
                  variant="default"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Ir a editar contacto
                </Button>
              ) : null}
              <AlertDialogAction
                onClick={() => {
                  setShowEmailDialog(false)
                  setDuplicateEmail('')
                  setDuplicateField(null)
                  setDuplicateContactId(null)
                }}
                className="w-full sm:w-auto order-1 sm:order-2"
              >
                {duplicateContactId ? 'Cerrar' : 'Entendido'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  )
}

