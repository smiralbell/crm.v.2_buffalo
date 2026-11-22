import sharp from 'sharp'

/**
 * Formatos de las imágenes del blog publicado (lo usan publish.ts y render.ts):
 * - WebP para todo lo que se ve en la página (destacada, imagen1, imagen2): es lo que hace que cargue rápido.
 * - Además, una miniatura .jpg SOLO de la destacada: la que aparece al compartir el enlace
 *   en WhatsApp o LinkedIn. Algunas de esas apps no muestran bien WebP, y .jpg pesa
 *   mucho menos que .png (unos 150 KB frente a 1,4 MB).
 * - Sin .png: las fotos de dentro del artículo nadie las comparte.
 */

export const SHARE_THUMB_NAME = 'destacada.jpg'

export function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.split(',')[1] || '', 'base64')
}

/** La versión WebP de una imagen (data URL, PNG o JPEG de origen). */
export function webpFromDataUrl(dataUrl: string): Promise<Buffer> {
  return sharp(dataUrlToBuffer(dataUrl)).webp({ quality: 82 }).toBuffer()
}

/** La miniatura para compartir: JPEG de la destacada. */
export function shareJpgFromDataUrl(dataUrl: string): Promise<Buffer> {
  return sharp(dataUrlToBuffer(dataUrl)).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
}

/** Nombre público de una imagen del artículo, siempre en WebP. */
export function webpName(slot: 'destacada' | 'imagen1' | 'imagen2'): string {
  return `${slot}.webp`
}
