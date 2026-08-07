// POST /api/chat, in production.
//
// The Vite plugin in `server/plugin.ts` only mounts this route on the dev and
// preview servers, so a deployed build would answer the POST with a bare 405.
// Same route as a serverless function; Vercel's zero-config picks up any
// `api/*.ts` under the project root.
//
// As with the notify endpoint, the logic is not duplicated: `handleChat` takes
// and returns plain values, so this and the dev middleware are thin transports
// over the one implementation.

import type { VercelRequest, VercelResponse } from '@vercel/node'
// The `.js` extension is what TypeScript emits verbatim and what Node resolves
// at runtime; it still points at the `.ts` source at compile time. Without it
// the built function throws ERR_MODULE_NOT_FOUND on the first request.
import { handleChat } from '../server/chat.js'

// A tool round-trip plus a cold start deserves more than the 10s default; the
// handler itself gives up at 25s so there is room to return a readable error.
export const config = { maxDuration: 30 }

/**
 * Vercel's Node runtime parses a JSON body into `req.body` on its own. It is
 * left as a string when the client sends an unexpected content type, and absent
 * if a future runtime stops parsing — so both are handled rather than assumed.
 */
function readBody(req: VercelRequest): unknown {
  const body = req.body
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'POST only' })
  }

  try {
    const result = await handleChat(readBody(req))
    if (!result.body.ok) console.error('[qc/chat]', result.body.error)
    return res.status(result.status).json(result.body)
  } catch (err) {
    // `handleChat` returns its failures rather than throwing, so this is the
    // unforeseen kind and is worth logging in full.
    console.error('[qc/chat]', err)
    const error = err instanceof Error ? err.message : 'უცნობი შეცდომა'
    return res.status(500).json({ ok: false, error })
  }
}
