import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import TasksWorkspace from '@/components/tareas/TasksWorkspace'
import { requireAuth } from '@/lib/auth'

/**
 * Módulo Tareas de developers, project managers y comerciales.
 * El admin no lo tiene: pone y mira tareas desde la ficha de cada usuario.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role === 'admin') {
      return { redirect: { destination: '/usuarios', permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function TareasPage() {
  return (
    <Layout>
      <div className="w-full pb-8">
        <TasksWorkspace storageKey="tareas:me" />
      </div>
    </Layout>
  )
}
