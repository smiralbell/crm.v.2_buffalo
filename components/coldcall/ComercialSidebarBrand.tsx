import Link from 'next/link'
import Image from 'next/image'

export default function ComercialSidebarBrand({ href }: { href: string }) {
  return (
    <Link href={href} className="block -mx-2 py-0.5 select-none">
      <Image
        src="/buffalo-cool-calling-logo.png"
        alt="Buffalo Cool Calling"
        width={260}
        height={110}
        className="w-full h-auto max-h-[110px] object-contain"
        priority
        unoptimized
      />
    </Link>
  )
}
