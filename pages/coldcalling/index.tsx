import { GetServerSideProps } from 'next'

export default function ColdCallingRedirect() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
      Redirigiendo…
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/marketing?tab=coldcalling', permanent: false },
})
