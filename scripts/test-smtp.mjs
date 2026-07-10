import nodemailer from 'nodemailer'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvFile(fileName) {
  const path = resolve(root, fileName)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

function parseBool(value, fallback) {
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

const host = process.env.SMTP_HOST?.trim()
const user = process.env.SMTP_USER?.trim()
const pass = process.env.SMTP_PASS?.trim()
const from = process.env.SMTP_FROM?.trim() || user
const port = Number(process.env.SMTP_PORT || '465')
const secure = parseBool(process.env.SMTP_SECURE, port === 465)
const to = process.argv[2]?.trim() || from

if (!host || !user || !pass || !from) {
  console.error('Faltan variables SMTP en .env o .env.local')
  console.error('Necesitas: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM')
  process.exit(1)
}

if (!to) {
  console.error('Uso: node scripts/test-smtp.mjs [email_destino]')
  process.exit(1)
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
})

try {
  console.log(`Verificando SMTP ${host}:${port} (secure=${secure})...`)
  await transporter.verify()
  console.log('Conexión SMTP OK')

  const now = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
  const info = await transporter.sendMail({
    from: `"Buffalo CRM" <${from}>`,
    to,
    subject: 'Prueba SMTP · Buffalo CRM',
    text: `Correo de prueba enviado correctamente.\nFecha: ${now}`,
    html: `<p>Correo de prueba enviado correctamente desde <strong>Buffalo CRM</strong>.</p><p>Fecha: ${now}</p>`,
  })

  console.log(`Correo enviado a ${to}`)
  console.log(`Message ID: ${info.messageId}`)
} catch (e) {
  console.error('Error SMTP:', e instanceof Error ? e.message : e)
  process.exitCode = 1
}
