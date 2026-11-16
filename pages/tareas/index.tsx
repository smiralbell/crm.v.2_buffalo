import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import TasksWorkspace from '@/components/tareas/TasksWorkspace'
import { requireAuth } from '@/lib/auth'

/**
 * Módulo Tareas. Developers, PMs y comerciales ven las suyas; los admins, las de
 * todo el equipo, con filtro de personas, y pueden poner tareas a cualquiera.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
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
