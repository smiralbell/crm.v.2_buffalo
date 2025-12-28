import { ReactNode } from 'react'

interface FullScreenLayoutProps {
  children: ReactNode
}

export default function FullScreenLayout({ children }: FullScreenLayoutProps) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50">
      <div className="h-full w-full">{children}</div>
    </div>
  )
}

