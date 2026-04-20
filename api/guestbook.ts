import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

const KV_KEY = 'guestbook:entries'
const MAX_ENTRIES = 200
const MAX_LENGTH = 500

interface GuestEntry {
  id: string
  nickname: string
  text: string
  timestamp: string // ISO 8601
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const entries: GuestEntry[] = (await kv.lrange(KV_KEY, 0, MAX_ENTRIES - 1)) || []
      return res.status(200).json({ entries })
    }

    if (req.method === 'POST') {
      const { nickname, text } = req.body as { nickname?: string; text?: string }

      if (!nickname || !text || typeof text !== 'string') {
        return res.status(400).json({ error: 'nickname and text required' })
      }

      const trimmed = text.trim().slice(0, MAX_LENGTH)
      if (trimmed.length === 0) {
        return res.status(400).json({ error: 'text cannot be empty' })
      }

      const entry: GuestEntry = {
        id: crypto.randomUUID(),
        nickname,
        text: trimmed,
        timestamp: new Date().toISOString(),
      }

      await kv.lpush(KV_KEY, entry)
      await kv.ltrim(KV_KEY, 0, MAX_ENTRIES - 1)

      return res.status(201).json({ entry })
    }

    return res.status(405).json({ error: 'method not allowed' })
  } catch (err) {
    // KV not configured — return empty gracefully
    if (req.method === 'GET') {
      return res.status(200).json({ entries: [] })
    }
    return res.status(503).json({ error: 'storage not available' })
  }
}
