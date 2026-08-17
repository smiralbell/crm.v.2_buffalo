import { jsPDF } from 'jspdf'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN_X = 16
const MARGIN_TOP = 22
const MARGIN_BOTTOM = 16
const CONTENT_W = PAGE_W - MARGIN_X * 2

const INK: [number, number, number] = [17, 24, 39]
const MUTED: [number, number, number] = [75, 85, 99]
const RULE: [number, number, number] = [229, 231, 235]
const CODE_BG: [number, number, number] = [249, 250, 251]
const HEADER_BG: [number, number, number] = [17, 24, 39]
const TABLE_HEAD: [number, number, number] = [31, 41, 55]
const WHITE: [number, number, number] = [255, 255, 255]
const ACCENT: [number, number, number] = [37, 99, 235]

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'hr' }
  | { type: 'code'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }

function pdfSafe(input: string): string {
  return input
    .replace(/[\u2500-\u257F]/g, (ch) => {
      if ('│┃'.includes(ch)) return '|'
      if ('─━┄┅┈┉'.includes(ch)) return '-'
      if ('►▶→'.includes(ch)) return '>'
      if ('◄◀←'.includes(ch)) return '<'
      return '+'
    })
    .replace(/[►▶→]/g, '>')
    .replace(/[◄◀←]/g, '<')
    .replace(/☐/g, '[ ]')
    .replace(/[☑☒✅]/g, '[x]')
    .replace(/•/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\x80-\xff]/g, '?')
}

function stripInlineMd(text: string): string {
  return pdfSafe(
    text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
  )
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((c) => stripInlineMd(c.trim()))
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(line) && /---/.test(line)
}

function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    if (line.trim().startsWith('```')) {
      const code: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(pdfSafe(lines[i]))
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ type: 'code', text: code.join('\n') })
      continue
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = parseTableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]))
        i += 1
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    const h = /^(#{1,3})\s+(.+)$/.exec(line)
    if (h) {
      const level = h[1].length as 1 | 2 | 3
      blocks.push({ type: (`h${level}` as 'h1' | 'h2' | 'h3'), text: stripInlineMd(h[2]) })
      i += 1
      continue
    }

    if (line.trim().startsWith('> ')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(stripInlineMd(lines[i].replace(/^\s*>\s?/, '')))
        i += 1
      }
      blocks.push({ type: 'quote', text: quote.join(' ') })
      continue
    }

    const ulMatch = /^[-*]\s+(.+)$/.exec(line)
    if (ulMatch) {
      const items: string[] = []
      while (i < lines.length) {
        const m = /^[-*]\s+(.+)$/.exec(lines[i])
        if (!m) break
        items.push(stripInlineMd(m[1].replace(/^\[([ xX])\]\s*/, '')))
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    const olMatch = /^\d+\.\s+(.+)$/.exec(line)
    if (olMatch) {
      const items: string[] = []
      while (i < lines.length) {
        const m = /^\d+\.\s+(.+)$/.exec(lines[i])
        if (!m) break
        items.push(stripInlineMd(m[1]))
        i += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      para.push(stripInlineMd(lines[i].trim()))
      i += 1
    }
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') })
  }

  return blocks
}

export function buildTicketsWebhookGuidePdf(markdown: string): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const blocks = parseMarkdown(markdown)
  let y = MARGIN_TOP
  let page = 1

  const drawChrome = () => {
    doc.setFillColor(...HEADER_BG)
    doc.rect(0, 0, PAGE_W, 12, 'F')
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('BUFFALO CRM', MARGIN_X, 7.5)
    doc.setFont('helvetica', 'normal')
    doc.text('Guía de integración de tickets', PAGE_W - MARGIN_X, 7.5, {
      align: 'right',
    })

    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(MARGIN_X, PAGE_H - 10, PAGE_W - MARGIN_X, PAGE_H - 10)
    doc.setTextColor(...MUTED)
    doc.setFontSize(8)
    doc.text('Documento para developers del dashboard cliente', MARGIN_X, PAGE_H - 6)
    doc.text(String(page), PAGE_W - MARGIN_X, PAGE_H - 6, { align: 'right' })
    doc.setTextColor(...INK)
  }

  const newPage = () => {
    doc.addPage()
    page += 1
    drawChrome()
    y = MARGIN_TOP
  }

  const ensure = (h: number) => {
    if (y + h > PAGE_H - MARGIN_BOTTOM) newPage()
  }

  drawChrome()

  for (const block of blocks) {
    if (block.type === 'h1') {
      ensure(16)
      y += 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(...INK)
      const lines = doc.splitTextToSize(block.text, CONTENT_W)
      doc.text(lines, MARGIN_X, y)
      y += lines.length * 7 + 3
      continue
    }

    if (block.type === 'h2') {
      ensure(14)
      y += 5
      doc.setDrawColor(...ACCENT)
      doc.setLineWidth(1.2)
      doc.line(MARGIN_X, y - 4, MARGIN_X, y + 3)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(...INK)
      const lines = doc.splitTextToSize(block.text, CONTENT_W - 4)
      doc.text(lines, MARGIN_X + 4, y)
      y += lines.length * 6 + 3
      continue
    }

    if (block.type === 'h3') {
      ensure(10)
      y += 3
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...INK)
      const lines = doc.splitTextToSize(block.text, CONTENT_W)
      doc.text(lines, MARGIN_X, y)
      y += lines.length * 5.2 + 2
      continue
    }

    if (block.type === 'hr') {
      ensure(6)
      y += 2
      doc.setDrawColor(...RULE)
      doc.setLineWidth(0.3)
      doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y)
      y += 4
      continue
    }

    if (block.type === 'p') {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...INK)
      const lines = doc.splitTextToSize(block.text, CONTENT_W)
      for (const line of lines) {
        ensure(5.2)
        doc.text(line, MARGIN_X, y)
        y += 5.2
      }
      y += 2
      continue
    }

    if (block.type === 'quote') {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(10)
      const lines = doc.splitTextToSize(block.text, CONTENT_W - 8)
      const h = lines.length * 5.2 + 4
      ensure(h)
      doc.setFillColor(239, 246, 255)
      doc.rect(MARGIN_X, y - 4, CONTENT_W, h, 'F')
      doc.setFillColor(...ACCENT)
      doc.rect(MARGIN_X, y - 4, 1.4, h, 'F')
      doc.setTextColor(30, 64, 175)
      doc.text(lines, MARGIN_X + 5, y)
      y += h + 2
      doc.setTextColor(...INK)
      continue
    }

    if (block.type === 'ul' || block.type === 'ol') {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...INK)
      block.items.forEach((item, idx) => {
        const bullet = block.type === 'ol' ? `${idx + 1}.` : '-'
        const indent = 6
        const lines = doc.splitTextToSize(item, CONTENT_W - indent - 4)
        ensure(lines.length * 5.2 + 1)
        doc.text(bullet, MARGIN_X, y)
        doc.text(lines, MARGIN_X + indent, y)
        y += lines.length * 5.2 + 1
      })
      y += 2
      continue
    }

    if (block.type === 'code') {
      doc.setFont('courier', 'normal')
      doc.setFontSize(7.5)
      const codeLines = block.text.split('\n')
      const lineH = 3.8
      const pad = 3
      for (let start = 0; start < codeLines.length; ) {
        const available = PAGE_H - MARGIN_BOTTOM - y - pad * 2
        const maxLines = Math.max(1, Math.floor(available / lineH))
        const chunk = codeLines.slice(start, start + maxLines)
        const boxH = chunk.length * lineH + pad * 2
        if (y + boxH > PAGE_H - MARGIN_BOTTOM && start === 0) {
          newPage()
          continue
        }
        doc.setFillColor(...CODE_BG)
        doc.setDrawColor(...RULE)
        doc.setLineWidth(0.2)
        doc.roundedRect(MARGIN_X, y - 2, CONTENT_W, boxH, 1.5, 1.5, 'FD')
        doc.setTextColor(55, 65, 81)
        chunk.forEach((cl, idx) => {
          doc.text(cl.slice(0, 118), MARGIN_X + 3, y + pad + 1.5 + idx * lineH)
        })
        y += boxH + 3
        start += chunk.length
        if (start < codeLines.length) newPage()
      }
      doc.setTextColor(...INK)
      continue
    }

    if (block.type === 'table') {
      const cols = Math.max(block.headers.length, 1)
      const colW = CONTENT_W / cols
      const fontSize = cols >= 3 ? 8 : 9
      const lineH = 4.2
      const pad = 2.2

      const drawRow = (cells: string[], header: boolean) => {
        doc.setFont('helvetica', header ? 'bold' : 'normal')
        doc.setFontSize(fontSize)
        const wrapped = cells.map((c) =>
          doc.splitTextToSize(c || ' ', colW - pad * 2)
        )
        while (wrapped.length < cols) wrapped.push([''])
        const rowH = Math.max(...wrapped.map((w) => w.length)) * lineH + pad * 2
        ensure(rowH)
        if (header) {
          doc.setFillColor(...TABLE_HEAD)
          doc.rect(MARGIN_X, y - 3.2, CONTENT_W, rowH, 'F')
          doc.setTextColor(...WHITE)
        } else {
          doc.setDrawColor(...RULE)
          doc.setLineWidth(0.2)
          doc.rect(MARGIN_X, y - 3.2, CONTENT_W, rowH)
          doc.setTextColor(...INK)
        }
        wrapped.forEach((lines, ci) => {
          doc.text(lines, MARGIN_X + ci * colW + pad, y)
        })
        y += rowH
      }

      ensure(12)
      drawRow(block.headers, true)
      for (const row of block.rows) {
        drawRow(row, false)
      }
      y += 3
    }
  }

  return Buffer.from(doc.output('arraybuffer'))
}
