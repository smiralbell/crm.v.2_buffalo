/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // En esta imagen Docker arrancamos con `npm start` y node_modules completo,
  // así que no necesitamos que Next calcule file tracing (fase muy lenta en CI).
  outputFileTracing: false,
}

module.exports = nextConfig

