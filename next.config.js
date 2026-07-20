const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // En esta imagen Docker arrancamos con `npm start` y node_modules completo,
  // así que no necesitamos que Next calcule file tracing (fase muy lenta en CI).
  outputFileTracing: false,
  // FullCalendar ESM: evita que webpack busque index.js en la raíz del paquete.
  transpilePackages: [
    '@fullcalendar/core',
    '@fullcalendar/react',
    '@fullcalendar/daygrid',
    '@fullcalendar/timegrid',
    '@fullcalendar/interaction',
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@fullcalendar/react': path.resolve(
        __dirname,
        'node_modules/@fullcalendar/react/dist/index.cjs'
      ),
    }
    return config
  },
}

module.exports = nextConfig

