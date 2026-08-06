// Mounts the notify endpoint on Vite's own dev/preview server.
//
// The app is a static SPA with no backend of its own, and this is the one thing
// that genuinely cannot run in the browser. Rather than stand up a second
// process the inspector has to remember to start, the handler rides along on
// the server that is already running — `npm run dev` is still the whole command.
//
// A deployed build has no Vite server, so production is served by the Vercel
// function in `api/notify-defect.ts` instead — same path, same handler, so
// nothing on the client changes.

import { loadEnv, type Plugin, type Connect } from 'vite'
import { handleNotifyDefect } from './notify'

const ROUTE = '/api/notify-defect'

/** Ceiling on the request body — three 1600px JPEGs, base64'd, with headroom. */
const MAX_BODY_BYTES = 12 * 1024 * 1024

function readJson(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('მოთხოვნა ზედმეტად დიდია — შეამცირეთ ფოტოების რაოდენობა'))
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
  // `req.url` carries the query string too; the route has none, so compare paths.
  if (!req.url || req.url.split('?')[0] !== ROUTE) return next()

  const send = (status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }

  if (req.method !== 'POST') return send(405, { ok: false, error: 'POST only' })

  void (async () => {
    try {
      const result = await handleNotifyDefect(await readJson(req))
      if (!result.body.ok) console.error('[qc/mail]', result.body.error)
      send(result.status, result.body)
    } catch (err) {
      const error = err instanceof Error ? err.message : 'უცნობი შეცდომა'
      console.error('[qc/mail]', error)
      send(400, { ok: false, error })
    }
  })()
}

export function notifyPlugin(): Plugin {
  return {
    name: 'qc-notify-defect',
    // Only the dev and preview servers exist to mount on; a `vite build` has no
    // server, and loading the key during a build would be pointless anyway.
    apply: (_config, env) => !!env.command,
    configResolved(config) {
      // Vite only exposes VITE_-prefixed vars, and only to the client bundle.
      // The empty prefix loads everything in .env, which is where the key lives
      // — copied onto process.env for `notify.ts` to read.
      const env = loadEnv(config.mode, config.envDir || config.root, '')
      for (const [k, v] of Object.entries(env)) process.env[k] ??= v
      if (!process.env.RESEND_API_KEY) {
        config.logger.warn('[qc/mail] RESEND_API_KEY არ არის — ხარვეზის შეტყობინება არ გაიგზავნება')
      }
    },
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
