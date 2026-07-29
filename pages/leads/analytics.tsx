import { GetServerSideProps } from 'next'

/** Redirige al Dashboard — la analítica de leads vive allí. */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/dashboard#leads-analytics',
    permanent: false,
  },
})

export default function LeadsAnalyticsRedirect() {
  return null
}
