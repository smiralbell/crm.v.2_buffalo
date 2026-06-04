import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'

const PLACES_API = 'https://places.googleapis.com/v1/places:searchText'
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.types',
  'nextPageToken',
].join(',')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  const { query, ciudad, pageToken } = req.body as {
    query: string
    ciudad: string
    pageToken?: string
  }

  if (!query?.trim() || !ciudad?.trim()) {
    return res.status(400).json({ error: 'query y ciudad son obligatorios' })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY no configurada' })
  }

  const textQuery = `${query.trim()} ${ciudad.trim()}`

  const body: Record<string, unknown> = {
    textQuery,
    languageCode: 'es',
    regionCode: 'ES',
    maxResultCount: 20,
  }
  if (pageToken) body.pageToken = pageToken

  try {
    const r = await fetch(PLACES_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    })

    if (!r.ok) {
      const err = await r.text()
      console.error('Places API error:', err)
      return res.status(r.status).json({ error: `Google Places API: ${r.status}`, detail: err })
    }

    const data = await r.json()
    const places = (data.places || []) as Record<string, unknown>[]

    // Normalizar resultados
    const results = places
      .filter((p) => p.businessStatus === 'OPERATIONAL' || !p.businessStatus)
      .map((p) => {
        const display = p.displayName as { text?: string } | undefined
        const addr = (p.formattedAddress as string) || ''

        // Extraer zona de la dirección (última parte antes de España)
        const addrParts = addr.replace(', España', '').replace(', Spain', '').split(',')
        const zona = addrParts[addrParts.length - 1]?.trim() || ciudad

        return {
          placeId:  p.id,
          nombre:   display?.text || 'Sin nombre',
          empresa:  display?.text || '',
          telefono: (p.nationalPhoneNumber as string) || (p.internationalPhoneNumber as string) || '',
          web:      (p.websiteUri as string) || '',
          zona,
          sector:   query.trim(),
          direccion: addr,
          rating:   p.rating,
          reviews:  p.userRatingCount,
        }
      })

    return res.json({
      results,
      nextPageToken: data.nextPageToken || null,
      total: results.length,
    })
  } catch (e) {
    console.error('Search places error:', e)
    return res.status(500).json({ error: 'Error interno al consultar Google Places' })
  }
}
