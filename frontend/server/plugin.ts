// Mounts the server-side endpoints on Vite's own dev/preview server.
//
// The app is a static SPA with no backend of its own, and these two things
// genuinely cannot run in the browser: one holds a Resend key, the other an
// OpenAI key. Rather than stand up a second process the inspector has to
// remember to start, the handlers ride along on the server that is already
// running — `npm run dev` is still the whole command.
//
// A deployed build has no Vite server, so production is served by the Vercel
// functions in `api/` instead — same paths, same handlers, so nothing on the
// client changes.

import { loadEnv, type Plugin, type Connect } from 'vite'
import { handleNotifyDefect } from './notify.js'
import { handleChat } from './chat.js'

interface Result {
  status: number
  body: { ok: true; [k: string]: unknown } | { ok: false; error: string }
}

interface Route {
  path: string
  /** Ceiling on the request body for this route. */
  maxBytes: number
  /** Tag for the log line, so two endpoints stay distinguishable. */
  tag: string
  handle: (raw: unknown) => Promise<Result>
}

const ROUTES: Route[] = [
  // Three 1600px JPEGs, base64'd, with headroom.
  { path: '/api/notify-defect', maxBytes: 12 * 1024 * 1024, tag: 'mail', handle: handleNotifyDefect },
  // Text only — the handler's own cap is 60k chars, this is the transport's.
  { path: '/api/chat', maxBytes: 256 * 1024, tag: 'chat', handle: handleChat },
]

function readJson(req: Connect.IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('მოთხოვნა ზედმეტად დიდია'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('არავალიდური JSON'))
      }
    })
  })
}

const middleware: Connect.NextHandleFunction = (req, res, next) => {
  // `req.url` carries the query string too; the routes have none, so compare
  // paths.
  const path = req.url?.split('?')[0]
  const route = ROUTES.find((r) => r.path === path)
  if (!route) return next()

  const send = (status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }

  if (req.method !== 'POST') return send(405, { ok: false, error: 'POST only' })

  void (async () => {
    try {
      const result = await route.handle(await readJson(req, route.maxBytes))
      if (!result.body.ok) console.error(`[qc/${route.tag}]`, result.body.error)
      send(result.status, result.body)
    } catch (err) {
      const error = err instanceof Error ? err.message : 'უცნობი შეცდომა'
      console.error(`[qc/${route.tag}]`, error)
      send(400, { ok: false, error })
    }
  })()
}

/** Keys the endpoints need, and what stops working without each. */
const REQUIRED_KEYS: [key: string, warning: string][] = [
  ['RESEND_API_KEY', '[qc/mail] RESEND_API_KEY არ არის — ხარვეზის შეტყობინება არ გაიგზავნება'],
  ['OPENAI_API_KEY', '[qc/chat] OPENAI_API_KEY არ არის — ასისტენტი არ იმუშავებს'],
]

export function apiPlugin(): Plugin {
  return {
    name: 'qc-api',
    // Only the dev and preview servers exist to mount on; a `vite build` has no
    // server, and loading the keys during a build would be pointless anyway.
    apply: (_config, env) => !!env.command,
    configResolved(config) {
      // Vite only exposes VITE_-prefixed vars, and only to the client bundle.
      // The empty prefix loads everything in .env, which is where the keys live
      // — copied onto process.env for the handlers to read.
      const env = loadEnv(config.mode, config.envDir || config.root, '')
      for (const [k, v] of Object.entries(env)) process.env[k] ??= v
      for (const [key, warning] of REQUIRED_KEYS) {
        if (!process.env[key]) config.logger.warn(warning)
      }
    },
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
