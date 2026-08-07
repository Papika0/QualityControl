// POST /api/chat — one turn of the assistant, proxied to OpenRouter.
//
// This runs on the server for one reason only: the OpenRouter key must never
// reach the browser. It is otherwise stateless and holds no data — the app has
// no backend database, so every fact in an answer comes from a tool the
// *browser* executed against IndexedDB and sent back as a `tool` message. The
// conversation therefore round-trips: ask → tool_calls → results → ask again.
// `src/lib/chat.ts` drives that loop; this file answers one hop of it.
//
// Same shape as `notify.ts`: takes and returns plain values, so the Vite dev
// middleware and the serverless function share one implementation.

import { buildSystemPrompt, roleTools, type ChatContext } from './chat-tools.js'

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * Models this endpoint will call. The client picks nothing — but the client is
 * also the only caller, and the endpoint is unauthenticated, so the allowlist
 * is what stops a tampered request from spending the key on the most expensive
 * model OpenRouter offers.
 */
const ALLOWED_MODELS = [
  'openai/gpt-5-mini',
  'openai/gpt-5',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o-mini',
]

const DEFAULT_MODEL = 'openai/gpt-5-mini'

/** Ceilings on one turn. The tool loop is capped client-side at 4 rounds; a
 *  round trades ~2 messages, so 24 leaves room for a real conversation. */
const MAX_MESSAGES = 24
const MAX_CHARS = 60_000
/** Answers here are 2-4 sentences. This is a cost ceiling, not a target. */
const MAX_TOKENS = 700
/** Vercel gives the function 30s; leave room to return a readable error. */
const TIMEOUT_MS = 25_000

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ChatResult {
  status: number
  body:
    | { ok: true; message: ChatMessage; model: string }
    | { ok: false; error: string }
}

interface ChatRequest {
  messages: ChatMessage[]
  context: ChatContext
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const ROLES: ChatMessage['role'][] = ['user', 'assistant', 'tool']

function parseToolCalls(raw: unknown): ToolCall[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const calls = raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => {
      const fn = (c.function ?? {}) as Record<string, unknown>
      return {
        id: str(c.id),
        type: 'function' as const,
        function: { name: str(fn.name), arguments: typeof fn.arguments === 'string' ? fn.arguments : '{}' },
      }
    })
    .filter((c) => c.id && c.function.name)
  return calls.length ? calls : undefined
}

function parse(raw: unknown): ChatRequest | string {
  if (!raw || typeof raw !== 'object') return 'ტანი არ არის JSON ობიექტი'
  const b = raw as Record<string, unknown>

  if (!Array.isArray(b.messages)) return 'messages აკლია'
  if (b.messages.length === 0) return 'messages ცარიელია'
  if (b.messages.length > MAX_MESSAGES) return `მიმოწერა ზედმეტად გრძელია (მაქს. ${MAX_MESSAGES})`

  const messages: ChatMessage[] = []
  let chars = 0

  for (const m of b.messages) {
    if (!m || typeof m !== 'object') return 'messages შეიცავს არაობიექტს'
    const src = m as Record<string, unknown>
    const role = src.role as ChatMessage['role']
    if (!ROLES.includes(role)) return `დაუშვებელი role: ${String(src.role)}`

    // A system prompt is built here, never accepted from the caller — otherwise
    // the brief and the role scoping would be the client's to rewrite.
    const content = typeof src.content === 'string' ? src.content : null
    const tool_calls = parseToolCalls(src.tool_calls)
    if (content === null && !tool_calls) return 'შეტყობინებას არც ტექსტი აქვს, არც tool_calls'

    chars += content?.length ?? 0
    if (chars > MAX_CHARS) return 'მიმოწერა ზედმეტად დიდია'

    const out: ChatMessage = { role, content }
    if (tool_calls) out.tool_calls = tool_calls
    if (role === 'tool') {
      const id = str(src.tool_call_id)
      if (!id) return 'tool შეტყობინებას tool_call_id აკლია'
      out.tool_call_id = id
    }
    messages.push(out)
  }

  const c = (b.context ?? {}) as Record<string, unknown>
  const context: ChatContext = {
    role: str(c.role) || 'qa',
    roleName: str(c.roleName) || 'მომხმარებელი',
    personName: str(c.personName),
    projectId: str(c.projectId) || '—',
    projectName: str(c.projectName) || '—',
    today: str(c.today) || '—',
  }

  return { messages, context }
}

/** The configured model, or the default when it is unset or not allowed. */
function pickModel(): string {
  const wanted = (process.env.OPENROUTER_MODEL ?? '').trim()
  return wanted && ALLOWED_MODELS.includes(wanted) ? wanted : DEFAULT_MODEL
}

/** OpenRouter's failures are worth naming — the common ones are all fixable. */
function upstreamError(status: number, message: string): string {
  if (status === 401 || status === 403) return 'OpenRouter-მა გასაღები არ მიიღო — შეამოწმეთ OPENROUTER_API_KEY'
  if (status === 402) return 'OpenRouter-ის ბალანსი ამოიწურა'
  if (status === 429) return 'ძალიან ბევრი მოთხოვნა — სცადეთ რამდენიმე წამში'
  return message || `OpenRouter შეცდომა (HTTP ${status})`
}

export async function handleChat(raw: unknown): Promise<ChatResult> {
  const parsed = parse(raw)
  if (typeof parsed === 'string') return { status: 400, body: { ok: false, error: parsed } }

  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    return {
      status: 500,
      body: { ok: false, error: 'OPENROUTER_API_KEY არ არის განსაზღვრული (იხ. frontend/.env)' },
    }
  }

  const model = pickModel()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // OpenRouter's attribution headers — they identify the app on the
        // dashboard and in rankings. Neither is required to get an answer.
        'HTTP-Referer': process.env.OPENROUTER_APP_URL || 'http://localhost:5173',
        'X-Title': process.env.OPENROUTER_APP_TITLE || 'QC Platform',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(parsed.context) },
          ...parsed.messages,
        ],
        tools: roleTools(parsed.context.role),
        tool_choice: 'auto',
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
      }),
    })

    const payload = (await res.json().catch(() => null)) as {
      choices?: { message?: ChatMessage }[]
      error?: { message?: string }
    } | null

    // OpenRouter reports some refusals in `error` with a 200 on the wire, the
    // same way Resend does — so this is checked before the status.
    if (payload?.error) {
      return { status: 502, body: { ok: false, error: upstreamError(res.status, payload.error.message ?? '') } }
    }
    if (!res.ok) {
      return { status: 502, body: { ok: false, error: upstreamError(res.status, '') } }
    }

    const message = payload?.choices?.[0]?.message
    if (!message) return { status: 502, body: { ok: false, error: 'OpenRouter-მა პასუხი არ დააბრუნა' } }

    return {
      status: 200,
      body: {
        ok: true,
        model,
        message: {
          role: 'assistant',
          content: typeof message.content === 'string' ? message.content : null,
          ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
        },
      },
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      status: 502,
      body: {
        ok: false,
        error: aborted
          ? 'პასუხს ძალიან დიდი დრო დასჭირდა — სცადეთ თავიდან'
          : err instanceof Error
            ? err.message
            : 'ასისტენტთან კავშირი ვერ დამყარდა',
      },
    }
  } finally {
    clearTimeout(timer)
  }
}
