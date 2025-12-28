import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteSession } from '@/lib/auth'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sessionId = req.cookies.session_id

  if (sessionId) {
    await deleteSession(sessionId, res)
  }

  return res.status(200).json({ success: true })
}

