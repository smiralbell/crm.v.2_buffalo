import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import TasksWorkspace from '@/components/tareas/TasksWorkspace'
import { requireAuth } from '@/lib/auth'

interface Props {
  userId: number
}

/** Solo admin: las tareas de una persona a pantalla completa (se abre desde Usuarios). */
export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') {
      return { redirect: { destination: '/tareas', permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  const userId = parseInt(String(context.params?.id ?? ''), 10)
  if (!Number.isFinite(userId) || userId <= 0) return { notFound: true }
  return { props: { userId } }
}

export default function UsuarioTareasPage({ userId }: Props) {
  return (
    <Layout>
      <div className="w-full pb-8">
        <TasksWorkspace scopeUserId={userId} storageKey={`tareas:user:${userId}`} />
      </div>
    </Layout>
  )
}
