/**
 * Cliente FTP mínimo (sin dependencias) para subir el blog a CDMON.
 *
 * - Modo pasivo (EPSV/PASV), binario.
 * - TLS explícito (FTPES: AUTH TLS) si `secure` es true, que es lo
 *   recomendado; los datos también van cifrados (PROT P) reutilizando
 *   la sesión TLS, como exigen muchos servidores.
 * - Crea las carpetas que falten.
 *
 * Credenciales en el entorno: CDMON_FTP_HOST, CDMON_FTP_USER,
 * CDMON_FTP_PASSWORD (y opcional CDMON_FTP_PORT, por defecto 21).
 */
import net from 'net'
import tls from 'tls'

type Sock = net.Socket | tls.TLSSocket

interface Reply {
  code: number
  text: string
}

export class Ftp {
  private sock!: Sock
  private buffer = ''
  private waiters: ((r: Reply) => void)[] = []
  private pending: Reply[] = []
  private secure = false
  private host = ''

  private attach(sock: Sock) {
    this.sock = sock
    sock.setEncoding('utf8')
    sock.on('data', (chunk: string) => {
      this.buffer += chunk
      // Respuestas de varias líneas: «123-...» hasta «123 ...»
      for (;;) {
        const m = this.buffer.match(/^(\d{3}) .*\r?\n/m)
        if (!m || m.index === undefined) break
        const endIdx = m.index + m[0].length
        const block = this.buffer.slice(0, endIdx)
        this.buffer = this.buffer.slice(endIdx)
        const reply = { code: Number(m[1]), text: block.trim() }
        const w = this.waiters.shift()
        if (w) w(reply)
        else this.pending.push(reply)
      }
    })
  }

  private read(timeoutMs = 20000): Promise<Reply> {
    const ready = this.pending.shift()
    if (ready) return Promise.resolve(ready)
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('El servidor FTP no responde')), timeoutMs)
      this.waiters.push((r) => {
        clearTimeout(t)
        resolve(r)
      })
    })
  }

  private async send(cmd: string, ok: number[] = [200, 250, 257, 227, 229, 230, 331, 350, 150, 125, 226, 234]): Promise<Reply> {
    this.sock.write(cmd + '\r\n')
    const r = await this.read()
    if (!ok.includes(r.code)) throw new Error(`FTP «${cmd.split(' ')[0]}»: ${r.text}`)
    return r
  }

  async connect(opts: { host: string; port?: number; user: string; password: string; secure: boolean }) {
    this.host = opts.host
    const sock = net.connect({ host: opts.host, port: opts.port || 21 })
    await new Promise<void>((res, rej) => {
      sock.once('connect', () => res())
      sock.once('error', rej)
      setTimeout(() => rej(new Error('No se pudo conectar con el servidor FTP')), 15000)
    })
    this.attach(sock)
    const hello = await this.read()
    if (hello.code !== 220) throw new Error('FTP: ' + hello.text)

    if (opts.secure) {
      await this.send('AUTH TLS', [234])
      sock.removeAllListeners('data')
      const secured = tls.connect({ socket: sock, servername: opts.host, rejectUnauthorized: false })
      await new Promise<void>((res, rej) => {
        secured.once('secureConnect', () => res())
        secured.once('error', rej)
      })
      this.attach(secured)
      this.secure = true
      await this.send('PBSZ 0')
      await this.send('PROT P')
    }
    await this.send('USER ' + opts.user, [230, 331])
    await this.send('PASS ' + opts.password, [230, 202])
    await this.send('TYPE I')
  }

  /** Abre la conexión de datos en modo pasivo. */
  private async dataSocket(): Promise<Sock> {
    let host = this.host
    let port: number
    try {
      const r = await this.send('EPSV', [229])
      port = Number((r.text.match(/\(\|\|\|(\d+)\|\)/) || [])[1])
    } catch {
      const r = await this.send('PASV', [227])
      const n = (r.text.match(/(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/) || []).slice(1).map(Number)
      port = n[4] * 256 + n[5]
      // Algunos servidores anuncian una IP interna: se usa siempre el host al que nos conectamos
      host = this.host
    }
    const raw = net.connect({ host, port })
    await new Promise<void>((res, rej) => {
      raw.once('connect', () => res())
      raw.once('error', rej)
    })
    if (!this.secure) return raw
    const s = tls.connect({ socket: raw, servername: this.host, rejectUnauthorized: false, session: (this.sock as tls.TLSSocket).getSession() })
    await new Promise<void>((res, rej) => {
      s.once('secureConnect', () => res())
      s.once('error', rej)
    })
    return s
  }

  async mkdirs(dir: string) {
    const parts = dir.split('/').filter(Boolean)
    let cur = dir.startsWith('/') ? '' : '.'
    for (const p of parts) {
      cur += '/' + p
      try {
        await this.send('MKD ' + cur, [257, 250])
      } catch {
        // ya existe
      }
    }
  }

  async put(path: string, data: Buffer) {
    const data$ = await this.dataSocket()
    await this.send('STOR ' + path, [150, 125])
    await new Promise<void>((res, rej) => {
      data$.once('error', rej)
      data$.end(data, () => res())
    })
    await new Promise((r) => data$.once('close', r))
    const done = await this.read(60000)
    if (done.code !== 226 && done.code !== 250) throw new Error(`FTP al subir ${path}: ${done.text}`)
  }

  async remove(path: string) {
    try {
      await this.send('DELE ' + path, [250, 200])
    } catch {
      // ya no existe
    }
  }

  async pwd(): Promise<string> {
    const r = await this.send('PWD', [257])
    return (r.text.match(/"([^"]*)"/) || [])[1] || '/'
  }

  async list(dir: string): Promise<string> {
    const d = await this.dataSocket()
    let out = ''
    d.setEncoding('utf8')
    d.on('data', (c: string) => (out += c))
    await this.send('NLST ' + dir, [150, 125, 226])
    await new Promise((r) => d.once('close', r))
    try {
      await this.read(10000)
    } catch {
      /* algunos servidores ya respondieron */
    }
    return out
  }

  async quit() {
    try {
      this.sock.write('QUIT\r\n')
    } finally {
      this.sock.end()
    }
  }
}

export function ftpConfigured() {
  return !!(process.env.CDMON_FTP_HOST && process.env.CDMON_FTP_USER && process.env.CDMON_FTP_PASSWORD)
}

export async function withFtp<T>(secure: boolean, fn: (ftp: Ftp) => Promise<T>): Promise<T> {
  if (!ftpConfigured()) throw new Error('Falta configurar la conexión con CDMON (CDMON_FTP_HOST, CDMON_FTP_USER y CDMON_FTP_PASSWORD en el entorno)')
  const ftp = new Ftp()
  await ftp.connect({
    host: process.env.CDMON_FTP_HOST!,
    port: Number(process.env.CDMON_FTP_PORT || 21),
    user: process.env.CDMON_FTP_USER!,
    password: process.env.CDMON_FTP_PASSWORD!,
    secure,
  })
  try {
    return await fn(ftp)
  } finally {
    await ftp.quit()
  }
}
