import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { listOpsAlertMessages, type OpsAlertMessage } from '@/lib/ops-alerts-store'
import { OpsAlertRow } from '@/components/crm/DashboardAlertsPanel'
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 20

interface Props {
  items: OpsAlertMessage[]
  page: number
  total: number
  totalPages: number
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  try {
    await requireAuth(context)
    const page = Math.max(1, parseInt(String(context.query.page || '1'), 10) || 1)
    const { items, total, pageSize } = await listOpsAlertMessages({ page, pageSize: PAGE_SIZE })
    return {
      props: {
        items,
        page,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    }
  } catch (error) {
    if (
      error instanceof Error &&
      ['No session', 'Invalid session', 'Expired session', 'Invalid token'].includes(error.message)
    ) {
      return { redirect: { destination: '/login', permanent: false } }
    }
    console.error('Alertas error:', error)
    return {
      props: { items: [], page: 1, total: 0, totalPages: 1 },
    }
  }
}

export default function AlertasPage({ items, page, total, totalPages }: Props) {
  return (
    <Layout>
      <div className="space-y-5 max-w-3xl">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <span className="mx-1.5">/</span>
            Alertas
          </p>
          <h1 className="text-xl font-semibold text-foreground mt-1 flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Historial de alertas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mensajes enviados por el canal de comunicación del CRM (mail y Telegram).
            {total > 0 ? ` ${total} en total.` : ''}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Aún no hay avisos. Cuando el CRM envíe un mail o Telegram, quedará registrado aquí.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <OpsAlertRow key={item.id} item={item} />
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              Página {page} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={page === 2 ? '/alertas' : `/alertas?page=${page - 1}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-50">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </span>
              )}
              {page < totalPages ? (
                <Link
                  href={`/alertas?page=${page + 1}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-50">
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
