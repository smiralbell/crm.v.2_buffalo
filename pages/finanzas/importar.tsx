import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, CheckCircle, XCircle, Loader2, FileText, ArrowLeft, ArrowDown, ArrowUp } from 'lucide-react'
import { format as formatDateFns } from 'date-fns'
import Link from 'next/link'

interface ImportResult {
  statement_id: string
  period_start: string
  period_end: string
  total_rows: number
  inserted: number
  duplicates: number
  transactions?: Array<{
    date: string
    amount: number
    description: string
  }>
}

interface Transaction {
  id: string
  date: string
  amount: number
  description: string
  balance: number | null
  created_at: string
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

  return {
    props: {},
  }
}

export default function ImportarExtracto() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
        setError('Por favor, selecciona un archivo CSV')
        setFile(null)
        return
      }
      setFile(selectedFile)
      setError(null)
      setResult(null)
      setTransactions([])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file) {
      setError('Por favor, selecciona un archivo CSV')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setTransactions([])

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/finance/import-statement', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al importar el extracto')
      }

      setResult(data)
      setFile(null)
      
      // Resetear el input file
      const fileInput = document.getElementById('csv-file') as HTMLInputElement
      if (fileInput) {
        fileInput.value = ''
      }

      // Si hay transacciones en la respuesta, usarlas directamente
      if (data.transactions && data.transactions.length > 0) {
        setTransactions(data.transactions.map((t: any, index: number) => ({
          id: `temp-${index}`,
          date: t.date,
          amount: t.amount,
          description: t.description,
          balance: t.balance || null,
          created_at: new Date().toISOString(),
        })))
      } else if (data.statement_id) {
        // Si no hay en la respuesta, cargar desde la base de datos
        await loadTransactions(data.statement_id)
      }
    } catch (err: any) {
      setError(err.message || 'Error al importar el extracto')
    } finally {
      setLoading(false)
    }
  }

  const loadTransactions = async (statementId: string) => {
    setLoadingTransactions(true)
    try {
      const response = await fetch(`/api/finance/transactions?statement_id=${statementId}`)
      const data = await response.json()
      
      if (response.ok) {
        setTransactions(data.transactions || [])
      }
    } catch (err) {
      console.error('Error loading transactions:', err)
    } finally {
      setLoadingTransactions(false)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return formatDateFns(date, 'dd/MM/yyyy')
    } catch {
      return dateStr
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <Link href="/finances">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        </div>

        {!result && (
          <Card>
            <CardHeader>
              <CardTitle>Subir Extracto CSV</CardTitle>
              <CardDescription>
                Selecciona el archivo CSV del extracto bancario
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="csv-file">Archivo CSV</Label>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    disabled={loading}
                    className="cursor-pointer"
                  />
                  {file && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                      <FileText className="h-4 w-4" />
                      <span>{file.name}</span>
                      <span className="text-gray-400">
                        ({(file.size / 1024).toFixed(2)} KB)
                      </span>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
                    <XCircle className="h-5 w-5" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={!file || loading}
                  className="w-full sm:w-auto"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Importar Extracto
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Movimientos del Extracto</CardTitle>
                <CardDescription>
                  Revisa y comprueba todos los movimientos importados
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTransactions ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    <span className="ml-3 text-gray-600">Cargando movimientos...</span>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No se encontraron movimientos para este extracto
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-6 gap-4 pb-3 border-b border-gray-200 font-semibold text-sm text-gray-600">
                      <div>Fecha</div>
                      <div className="col-span-2">Descripción</div>
                      <div className="text-right">Importe</div>
                      <div className="text-right">Saldo</div>
                      <div className="text-right">Tipo</div>
                    </div>
                    {transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="grid grid-cols-6 gap-4 py-3 px-2 rounded-lg hover:bg-gray-50 transition-colors border-b border-gray-100"
                      >
                        <div className="text-sm text-gray-700">
                          {formatDate(transaction.date)}
                        </div>
                        <div className="col-span-2 text-sm text-gray-900">
                          {transaction.description || '-'}
                        </div>
                        <div className={`text-right font-semibold ${
                          transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(transaction.amount)}
                        </div>
                        <div className="text-right font-medium text-gray-700">
                          {transaction.balance !== null && transaction.balance !== undefined 
                            ? formatCurrency(transaction.balance) 
                            : '-'}
                        </div>
                        <div className="text-right">
                          {transaction.amount >= 0 ? (
                            <ArrowUp className="h-4 w-4 text-green-600 inline" />
                          ) : (
                            <ArrowDown className="h-4 w-4 text-red-600 inline" />
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="pt-4 mt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">
                          Total de movimientos: {transactions.length}
                        </span>
                        <div className="flex gap-4">
                          <span className="text-sm text-gray-600">
                            Ingresos: <span className="font-semibold text-green-600">
                              {formatCurrency(
                                transactions
                                  .filter(t => t.amount >= 0)
                                  .reduce((sum, t) => sum + t.amount, 0)
                              )}
                            </span>
                          </span>
                          <span className="text-sm text-gray-600">
                            Gastos: <span className="font-semibold text-red-600">
                              {formatCurrency(
                                Math.abs(
                                  transactions
                                    .filter(t => t.amount < 0)
                                    .reduce((sum, t) => sum + t.amount, 0)
                                )
                              )}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="h-5 w-5" />
                  Importación Completada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Período del Extracto</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {formatDate(result.period_start)} - {formatDate(result.period_end)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Total de Movimientos</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {result.total_rows}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-700 mb-1">Movimientos Nuevos</p>
                    <p className="text-lg font-semibold text-green-800">
                      {result.inserted}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Duplicados Ignorados</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {result.duplicates}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center pt-4">
              <Button
                onClick={() => {
                  setResult(null)
                  setTransactions([])
                  setFile(null)
                  const fileInput = document.getElementById('csv-file') as HTMLInputElement
                  if (fileInput) {
                    fileInput.value = ''
                  }
                }}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Importar Otro Extracto
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
