import { GetServerSideProps } from 'next'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { canAccessColdCall } from '@/lib/auth-rbac'
import { canSeeDemoPrepReminders } from '@/lib/coldcall/meeting-reminders'
import { MeetingRemindersBlock } from '@/components/coldcall/MeetingReminders'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (!canAccessColdCall(user.role) || !canSeeDemoPrepReminders(user)) {
      return { redirect: { destination: '/comercial/reuniones', permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function PrepararDemosPage() {
  return (
    <Layout>
      <div className="space-y-4">
        <MeetingRemindersBlock />
      </div>
    </Layout>
  )
}
