import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import WorkLogWorkspace from '@/components/trabajo/WorkLogWorkspace'
import { requireAuth } from '@/lib/auth'
import { hasWorkLog } from '@/lib/trabajo/access'

/**
 * Trabajo diario de developers y project managers: lo que han hecho cada día.
 * El admin lo ve de cada persona desde Usuarios.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role === 'admin') return { redirect: { destination: '/usuarios', permanent: false } }
    if (!hasWorkLog(user.role)) return { redirect: { destination: '/tareas', permanent: false } }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function TrabajoPage() {
  return (
    <Layout>
      <div className="w-full pb-8">
        <WorkLogWorkspace storageKey="trabajo:me" />
      </div>
    </Layout>
  )
}
