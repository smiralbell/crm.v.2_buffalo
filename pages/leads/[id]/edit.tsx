import { GetServerSideProps } from 'next'

/** La edición de leads es un popup; esta ruta redirige al detalle. */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const id = context.params?.id
  return {
    redirect: {
      destination: id ? `/leads/${id}` : '/leads',
      permanent: false,
    },
  }
}

export default function EditLeadRedirect() {
  return null
}
