import Head from 'next/head'

/**
 * Página neutra del dominio de formularios.
 * No menciona login ni enlaces al CRM.
 */
export default function PublicFormsHomePage() {
  return (
    <>
      <Head>
        <title>Formularios</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          color: '#6b7280',
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div>
          <p style={{ fontSize: 15, margin: 0 }}>Formulario no encontrado</p>
          <p style={{ fontSize: 13, marginTop: 8, color: '#9ca3af' }}>
            Usa el enlace completo que te han enviado.
          </p>
        </div>
      </div>
    </>
  )
}
