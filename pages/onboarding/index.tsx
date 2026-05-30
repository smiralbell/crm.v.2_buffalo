import Layout from '@/components/Layout'
import { ExternalLink, Settings, ClipboardList } from 'lucide-react'

export default function OnboardingPage() {
  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configura proyectos, genera documentos y envía el formulario al cliente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

        {/* Configurador */}
        <a
          href="/configurador.html"
          target="_blank"
          rel="noreferrer"
          className="group flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gray-300 hover:shadow-md"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-900">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
          </div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">Configurador de proyecto</h2>
          <p className="mb-4 text-sm text-gray-500 leading-relaxed">
            Define el alcance, calcula el precio y genera la propuesta, el contrato, la factura y el link de onboarding para el cliente.
          </p>
          <div className="mt-auto space-y-2">
            {['Selecciona agentes y add-ons', 'Rellena datos del cliente', 'Genera propuesta · contrato · factura · onboarding'].map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
          <div className="mt-5 text-sm font-medium text-gray-900 group-hover:underline">
            Abrir configurador →
          </div>
        </a>

        {/* Formulario onboarding */}
        <a
          href="/onboarding.html"
          target="_blank"
          rel="noreferrer"
          className="group flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gray-300 hover:shadow-md"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-900">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
          </div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">Formulario de onboarding</h2>
          <p className="mb-4 text-sm text-gray-500 leading-relaxed">
            Formulario dinámico y personalizado según el alcance del proyecto. El cliente lo rellena y el equipo recibe el briefing completo.
          </p>
          <div className="mt-auto space-y-2">
            {['Se genera automáticamente desde el configurador', 'El cliente rellena en 10–15 min', 'El equipo recibe el briefing completo'].map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
          <div className="mt-5 text-sm font-medium text-gray-900 group-hover:underline">
            Ver formulario demo →
          </div>
        </a>

      </div>

      {/* Info box */}
      <div className="mt-8 rounded-lg border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm text-blue-700">
          <strong>Flujo recomendado:</strong> Usa el Configurador para cerrar el deal y generar todos los documentos. El link de onboarding que genera se envía directamente al cliente desde ahí.
        </p>
      </div>
    </Layout>
  )
}
