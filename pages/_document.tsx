import { Html, Head, Main, NextScript } from 'next/document'

/** Fuerza modo claro antes de hidratar (evita flash oscuro por OS / localStorage). */
const themeBoot = `(function(){try{var r=document.documentElement;r.classList.remove('dark');r.style.colorScheme='light';r.setAttribute('data-theme','light');localStorage.setItem('buffalo-crm-theme','light')}catch(e){}})();`

export default function Document() {
  return (
    <Html lang="es" className="light" style={{ colorScheme: 'light' }} suppressHydrationWarning>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content="#ffffff" />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body className="antialiased bg-white text-gray-900" style={{ colorScheme: 'light' }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
