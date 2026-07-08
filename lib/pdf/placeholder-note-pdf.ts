import { jsPDF } from 'jspdf'

function centerText(doc: jsPDF, text: string, y: number, pageWidth: number, fontSize: number) {
  doc.setFontSize(fontSize)
  const width = doc.getTextWidth(text)
  doc.text(text, (pageWidth - width) / 2, y)
}

function buildPlaceholderNotePdf(note: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const trimmed = note.trim()
  const red: [number, number, number] = [220, 38, 38]
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = 160

  const titleSize = 22
  const noteSize = 12
  const titleLineH = 10
  const noteLineH = 6
  const titleNoteGap = 8

  doc.setTextColor(...red)
  doc.setFontSize(noteSize)
  const noteLines = trimmed ? doc.splitTextToSize(trimmed, maxWidth) : []

  const totalHeight =
    titleLineH + (noteLines.length > 0 ? titleNoteGap + noteLines.length * noteLineH : 0)
  let y = (pageHeight - totalHeight) / 2 + titleLineH * 0.75

  centerText(doc, 'No hay factura', y, pageWidth, titleSize)

  if (noteLines.length > 0) {
    y += titleNoteGap + noteLineH * 0.25
    for (const line of noteLines) {
      y += noteLineH
      centerText(doc, line, y, pageWidth, noteSize)
    }
  }

  return doc
}

export function createPlaceholderNotePdfBytes(note: string): Uint8Array {
  const doc = buildPlaceholderNotePdf(note)
  return new Uint8Array(doc.output('arraybuffer'))
}

export function createPlaceholderNotePdfBuffer(note: string): Buffer {
  return Buffer.from(createPlaceholderNotePdfBytes(note))
}

export function createPlaceholderNotePdfBlob(note: string): Blob {
  const doc = buildPlaceholderNotePdf(note)
  return doc.output('blob')
}
