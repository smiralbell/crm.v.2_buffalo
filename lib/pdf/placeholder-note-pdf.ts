import { jsPDF } from 'jspdf'

function buildPlaceholderNotePdf(note: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const trimmed = note.trim() || 'Sin nota'
  const red: [number, number, number] = [220, 38, 38]
  const marginX = 20
  const maxWidth = 170

  doc.setTextColor(...red)
  doc.setFontSize(22)
  doc.text('No hay factura', marginX, 45)

  doc.setFontSize(12)
  doc.text('Porque:', marginX, 58)

  doc.setFontSize(11)
  const lines = doc.splitTextToSize(trimmed, maxWidth)
  doc.text(lines, marginX, 66)

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
