import { GetServerSideProps } from 'next'

/** Redirige a la pestaña unificada en /demos. */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/demos?tab=preparar',
      permanent: false,
    },
  }
}

export default function PrepararDemosRedirect() {
  return null
}
