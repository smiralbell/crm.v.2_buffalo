import { GetServerSideProps } from 'next'

export default function ColdCallingCampanasRedirect() {
  return null
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/marketing?tab=coldcalling&cc=campanas', permanent: false },
})
