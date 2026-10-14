import { GetServerSideProps } from 'next'

/** El widget de chat de la web ya no existe. */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/marketing?tab=web',
      permanent: false,
    },
  }
}

export default function MarketingWebChatRedirect() {
  return null
}
