import nodemailer from 'nodemailer'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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

const user = process.env.SMTP_USER
const pass = process.env.SMTP_PASS
const host = process.env.SMTP_HOST

const attempts = [
  { port: 465, secure: true, label: '465 SSL' },
  { port: 587, secure: false, label: '587 STARTTLS' },
]

for (const { port, secure, label } of attempts) {
  try {
    const t = nodemailer.createTransport({ host, port, secure, auth: { user, pass } })
    await t.verify()
    console.log(`OK con ${label}`)
    process.exit(0)
  } catch (e) {
    console.log(`FAIL ${label}:`, e instanceof Error ? e.message : e)
  }
}
process.exit(1)
