import { GetServerSideProps } from 'next'
import Head from 'next/head'
import AgentDiagram from '@/components/help/AgentDiagram'
import { requireAuth } from '@/lib/auth'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
    return { props: {} }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}

/** Ayuda: esquema de cómo funciona el agente de IA del CRM (página sin menú lateral). */
export default function AyudaPage() {
  return (
    <>
      <Head>
        <title>Cómo funciona el agente · Buffalo CRM</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="flex h-[100dvh] flex-col bg-[#eef0f3]">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-5 py-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Cómo funciona el agente de IA del CRM</h1>
            <p className="text-xs text-gray-500">
              Canales, quién escribe, los dos agentes, sus herramientas y los MCP. Pulsa una caja para ver qué hace.
            </p>
          </div>
        </header>
        <main className="min-h-0 flex-1">
          <AgentDiagram />
        </main>
      </div>
    </>
  )
}
