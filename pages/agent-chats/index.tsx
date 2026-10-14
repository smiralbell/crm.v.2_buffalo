import { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/marketing?tab=web',
      permanent: false,
    },
  }
}

export default function AgentChatsRedirect() {
  return null
}
