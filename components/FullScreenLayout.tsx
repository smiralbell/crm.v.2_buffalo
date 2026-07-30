import { ReactNode, useEffect } from 'react'

interface FullScreenLayoutProps {
  children: ReactNode
}

/** Pantalla a viewport fijo: sin scroll del body (evita el “rebote” global al acabar un panel). */
export default function FullScreenLayout({ children }: FullScreenLayoutProps) {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevHtmlOverscroll = html.style.overscrollBehavior
    const prevBodyOverscroll = body.style.overscrollBehavior

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overscrollBehavior = 'none'

    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      html.style.overscrollBehavior = prevHtmlOverscroll
      body.style.overscrollBehavior = prevBodyOverscroll
    }
  }, [])

  return (
    <div className="fixed inset-0 z-40 overflow-hidden overscroll-none bg-zinc-100/90">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">{children}</div>
    </div>
  )
}
