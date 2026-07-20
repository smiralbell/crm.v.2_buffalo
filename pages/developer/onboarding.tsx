import { GetServerSideProps } from 'next'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { defaultHomeForRole } from '@/lib/auth-rbac'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderKanban,
  HeartHandshake,
  KeyRound,
  Lock,
  Ticket,
  UserCheck,
} from 'lucide-react'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'developer' && user.role !== 'admin') {
      return { redirect: { destination: defaultHomeForRole(user.role), permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  )
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-foreground/70" />
      <span>{children}</span>
    </li>
  )
}

export default function DeveloperOnboardingPage() {
  return (
    <Layout>
      <div className="w-full max-w-3xl mx-auto space-y-5 pb-16">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/developer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al panel
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-foreground text-background px-5 py-7 sm:px-7">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-background/55">
            Onboarding · Rol developer
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
            Cómo funciona tu trabajo en Buffalo
          </h1>
          <p className="mt-3 text-sm text-background/75 max-w-xl leading-relaxed">
            Qué te damos, qué esperamos de ti y cómo se usa cada parte del CRM.
            Léelo una vez al entrar; es la fuente de verdad del rol developer.
          </p>
        </div>

        <nav className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Índice
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ['acceso', 'Acceso'],
              ['mapa', 'Menú'],
              ['proyectos', 'Proyectos'],
              ['tickets', 'Tickets'],
              ['retencion', 'Retención'],
              ['facturas', 'Facturas'],
              ['roles', 'Quién hace qué'],
              ['checklist', 'Primer día'],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <Section id="acceso" icon={KeyRound} title="1. Acceso: qué te damos">
          <p>
            Un admin crea tu usuario con rol <strong className="text-foreground">Developer</strong> y te
            pasa email + contraseña. Entras en <strong className="text-foreground">/login</strong> con
            email y contraseña (el botón de Google es solo para admin).
          </p>
          <p>Después te asignamos:</p>
          <ul className="space-y-2">
            <Li>Proyectos Buffalo (aparecen en Proyectos)</Li>
            <Li>Asignaciones puntuales (tareas sin proyecto grande)</Li>
            <Li>Tickets concretos</Li>
            <Li>Retención, si el proyecto tiene mantenimiento activo</Li>
            <Li>Documentación técnica en la pestaña Onboarding del proyecto</Li>
          </ul>
          <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <Lock className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
            <strong>Confidencial:</strong> precios, mensualidades y datos comerciales del cliente no
            aparecen en tu panel. Es intencional.
          </p>
        </Section>

        <Section id="mapa" icon={BookOpen} title="2. Mapa del menú">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Menú</th>
                  <th className="px-3 py-2 font-medium">Para qué</th>
                </tr>
              </thead>
              <tbody className="text-foreground/90">
                <tr className="border-b border-border">
                  <td className="px-3 py-2.5 font-medium">Dashboard</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Resumen: proyectos, tareas, tickets, horas, tus facturas</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-3 py-2.5 font-medium">Proyectos</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Proyectos abiertos + tickets</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-3 py-2.5 font-medium">Retención</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Guía técnica + KPIs (sin precios)</td>
                </tr>
                <tr>
                  <td className="px-3 py-2.5 font-medium">Facturas</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Facturar a Agencia Buffalo (+ PDF)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            No verás Leads, Finanzas, Marketing, Pipelines, Onboarding comercial, Calendario ni Usuarios.
          </p>
        </Section>

        <Section id="proyectos" icon={FolderKanban} title="3. Proyectos: el día a día">
          <p className="font-medium text-foreground">Dos tipos de trabajo</p>
          <ul className="space-y-2">
            <Li>
              <strong className="text-foreground">Proyecto Buffalo</strong> — entrega completa (voz, chat,
              dashboard…). Pestañas: Dashboard, Onboarding, Tareas.
            </Li>
            <Li>
              <strong className="text-foreground">Asignación puntual</strong> — encargo concreto sin
              proyecto grande. Brief + Empezar / Marcar como hecha.
            </Li>
          </ul>
          <p className="font-medium text-foreground pt-1">Tablero de tareas</p>
          <ul className="space-y-2">
            <Li>Pendiente → En curso → Validación por Buffalo → Hecho</Li>
            <Li>
              Cuando esté listo para review interno, muévelo a{' '}
              <strong className="text-foreground">Validación por Buffalo</strong>
            </Li>
          </ul>
          <p className="font-medium text-foreground pt-1">Flujo recomendado</p>
          <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
            <li>Abre el proyecto</li>
            <li>Lee Onboarding completo</li>
            <li>Revisa / crea tareas</li>
            <li>Trabaja y pasa a Validación por Buffalo cuando toque</li>
            <li>Atiende tickets si hay</li>
            <li>Si hay retención: mira guía + KPIs</li>
          </ol>
        </Section>

        <Section id="tickets" icon={Ticket} title="4. Tickets">
          <p>
            Solo ves tickets <strong className="text-foreground">asignados a ti</strong> de proyectos a
            los que tienes acceso.
          </p>
          <ul className="space-y-2">
            <Li>Leer el hilo y los datos del caso</Li>
            <Li>Responder</Li>
            <Li>Cambiar estado: Abierto → En progreso → Resuelto / Cerrado</Li>
          </ul>
          <p>No reasignas ni eliminas tickets: eso lo hace admin.</p>
        </Section>

        <Section id="retencion" icon={HeartHandshake} title="5. Retención">
          <p>
            Proyectos con mantenimiento activo. Tú das soporte técnico continuo; no gestionas el precio
            al cliente.
          </p>
          <ul className="space-y-2">
            <Li>
              <strong className="text-foreground">Guía de desarrollo</strong> — cómo está montado el servicio
            </Li>
            <Li>
              <strong className="text-foreground">KPIs</strong> — salud operativa del periodo
            </Li>
          </ul>
          <p>La pestaña comercial del proyecto (contrato / €) no aparece en tu rol.</p>
        </Section>

        <Section id="facturas" icon={FileText} title="6. Facturas (a Agencia Buffalo)">
          <p>
            Aquí sí hay importes: es lo que <strong className="text-foreground">tú cobras a Buffalo</strong>,
            no lo que Buffalo cobra al cliente.
          </p>
          <ul className="space-y-2">
            <Li>Cliente fijo: Agencia Buffalo</Li>
            <Li>Líneas con concepto, cantidad, precio sin IVA e IVA</Li>
            <Li>
              Para <strong className="text-foreground">emitir</strong> es obligatorio adjuntar el PDF
            </Li>
            <Li>Estados: Borrador / Enviada / Anulada</Li>
          </ul>
        </Section>

        <Section id="roles" icon={UserCheck} title="7. Quién hace qué">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Buffalo (admin)
              </p>
              <ul className="space-y-2 text-foreground/90">
                <Li>Crear tu usuario y acceso</Li>
                <Li>Asignarte proyectos y tickets</Li>
                <Li>Crear asignaciones puntuales</Li>
                <Li>Validar en “Validación por Buffalo”</Li>
                <Li>Producción, pricing y alcance comercial</Li>
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Tú (developer)
              </p>
              <ul className="space-y-2 text-foreground/90">
                <Li>Entregar según Onboarding + tareas</Li>
                <Li>Mantener el kanban al día</Li>
                <Li>Atender tickets asignados</Li>
                <Li>Usar retención (guía + KPIs)</Li>
                <Li>Facturar a Buffalo con PDF</Li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="checklist" icon={ClipboardList} title="8. Checklist del primer día">
          <ul className="space-y-2">
            <Li>Login con email/contraseña → llegas a /developer</Li>
            <Li>Reconoces el menú (Dashboard, Proyectos, Retención, Facturas)</Li>
            <Li>Confirmas que no ves Leads / Finanzas / Marketing</Li>
            <Li>Abres un proyecto (si ya tienes) y lees Onboarding</Li>
            <Li>Mirás el tablero de Tareas</Li>
            <Li>Sabes dónde están Tickets y Retención</Li>
            <Li>Sabes que Facturas = a Agencia Buffalo + PDF al emitir</Li>
            <Li>Entiendes: cero precios de cliente en tu panel</Li>
          </ul>
          <p className="pt-2 text-foreground font-medium">
            En una frase: Buffalo te da acceso, proyectos y contexto técnico; tú entregas, comunicas y
            facturas a la agencia — sin tocar la parte comercial del cliente.
          </p>
          <div className="pt-2">
            <Link
              href="/developer"
              className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 h-10 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Ir a mi panel
            </Link>
          </div>
        </Section>
      </div>
    </Layout>
  )
}
