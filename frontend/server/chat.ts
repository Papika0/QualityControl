// POST /api/chat — one turn of the assistant, against the OpenAI API.
//
// This runs on the server for one reason only: the OpenAI key must never reach
// the browser. It is otherwise stateless and holds no data — the app has no
// backend database, so every fact in an answer comes from a tool the *browser*
// executed against IndexedDB and sent back as a `tool` message. The
// conversation therefore round-trips: ask → tool_calls → results → ask again.
// `src/lib/chat.ts` drives that loop; this file answers one hop of it.
//
// Same shape as `notify.ts`: takes and returns plain values, so the Vite dev
// middleware and the serverless function share one implementation.

import { buildSystemPrompt, roleTools, type ChatContext } from './chat-tools.js'

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

/**
 * Models this endpoint will call. The client picks nothing — but the client is
 * also the only caller, and the endpoint is unauthenticated, so the allowlist
 * is what stops a tampered request from spending the key on the most expensive
 * model in the catalogue.
 */
const ALLOWED_MODELS = ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini']

const DEFAULT_MODEL = 'gpt-5-mini'

/**
 * The GPT-5 family reasons before it answers, and that costs two things a
 * gateway used to paper over:
 *
 *  - `temperature` other than the default is rejected outright, so it is only
 *    sent to the non-reasoning models;
 *  - the hidden reasoning tokens are billed against the completion ceiling, so
 *    a 700-token cap can be spent thinking and come back empty. These models
 *    get headroom and the cheapest thinking setting instead.
 */
const isReasoning = (model: string) => model.startsWith('gpt-5')

const EFFORTS = ['minimal', 'low', 'medium', 'high']

/**
 * How hard a reasoning model thinks before answering. `minimal` was the first
 * choice for cost and it was wrong: the answers came back in broken Georgian,
 * with characters from other scripts mixed in and the markdown link rule
 * ignored. Georgian is a low-resource language for these models and it is the
 * first thing to degrade when they are told not to think.
 */
function pickEffort(): string {
  const wanted = (process.env.OPENAI_REASONING_EFFORT ?? '').trim()
  return EFFORTS.includes(wanted) ? wanted : 'low'
}

/** Ceilings on one turn. The tool loop is capped client-side at 4 rounds; a
 *  round trades ~2 messages, so 24 leaves room for a real conversation. */
const MAX_MESSAGES = 24
const MAX_CHARS = 60_000
/** Answers here are 2-4 sentences. This is a cost ceiling, not a target. */
const MAX_TOKENS = 700
/** Room for the reasoning a GPT-5 model bills against the same ceiling. */
const REASONING_HEADROOM = 1_300
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
  const wanted = (process.env.OPENAI_MODEL ?? '').trim()
  return wanted && ALLOWED_MODELS.includes(wanted) ? wanted : DEFAULT_MODEL
}

/** OpenAI's failures are worth naming — the common ones are all fixable. */
function upstreamError(status: number, message: string): string {
  if (status === 401 || status === 403) return 'OpenAI-მ გასაღები არ მიიღო — შეამოწმეთ OPENAI_API_KEY'
  if (status === 429) {
    // 429 covers both "too fast" and "out of credit"; only the body tells them
    // apart, and they need different things done about them.
    return /quota|billing/i.test(message)
      ? 'OpenAI-ის ბალანსი ან ლიმიტი ამოიწურა — შეამოწმეთ ბილინგი'
      : 'ძალიან ბევრი მოთხოვნა — სცადეთ რამდენიმე წამში'
  }
  if (status === 404) return message || 'მოდელი მიუწვდომელია ამ გასაღებისთვის'
  return message || `OpenAI შეცდომა (HTTP ${status})`
}

export async function handleChat(raw: unknown): Promise<ChatResult> {
  const parsed = parse(raw)
  if (typeof parsed === 'string') return { status: 400, body: { ok: false, error: parsed } }

  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return {
      status: 500,
      body: { ok: false, error: 'OPENAI_API_KEY არ არის განსაზღვრული (იხ. frontend/.env)' },
    }
  }

  const model = pickModel()
  const reasoning = isReasoning(model)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    // Set only when the key belongs to more than one org or project; omitted
    // otherwise so a stray blank header cannot 401 the request.
    ...(process.env.OPENAI_ORG_ID ? { 'OpenAI-Organization': process.env.OPENAI_ORG_ID } : {}),
    ...(process.env.OPENAI_PROJECT_ID ? { 'OpenAI-Project': process.env.OPENAI_PROJECT_ID } : {}),
  }

  /** The half of the request that is not negotiable — a model, the brief, and
   *  the tools it answers with. */
  const core = {
    model,
    messages: [{ role: 'system', content: buildSystemPrompt(parsed.context) }, ...parsed.messages],
    tools: roleTools(parsed.context.role),
    tool_choice: 'auto',
  }

  /** The tuning, which is per-family and the part a model may refuse. */
  const tuning = {
    // `max_completion_tokens`, not `max_tokens`: the latter is deprecated on
    // Chat Completions and refused outright by the reasoning models.
    max_completion_tokens: reasoning ? MAX_TOKENS + REASONING_HEADROOM : MAX_TOKENS,
    ...(reasoning ? { reasoning_effort: pickEffort() } : { temperature: 0.2 }),
  }

  const ask = (body: object) =>
    fetch(ENDPOINT, { method: 'POST', signal: controller.signal, headers, body: JSON.stringify(body) })

  type Payload = {
    choices?: { message?: ChatMessage; finish_reason?: string }[]
    error?: { message?: string; param?: string }
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      prompt_tokens_details?: { cached_tokens?: number }
      completion_tokens_details?: { reasoning_tokens?: number }
    }
  } | null

  try {
    let res = await ask({ ...core, ...tuning })
    let payload = (await res.json().catch(() => null)) as Payload

    // Which tuning parameters a model accepts moves with the model, and the
    // allowlist here outlives any one of them. A refusal that names a parameter
    // is answered by dropping the tuning and asking again rather than failing
    // the turn — the answer is the point, the temperature is not.
    if (res.status === 400 && /parameter|unsupported|unrecognized/i.test(payload?.error?.message ?? '')) {
      console.warn('[qc/chat] tuning rejected, retrying without it:', payload?.error?.message)
      res = await ask(core)
      payload = (await res.json().catch(() => null)) as Payload
    }

    // What the turn cost, on one line. The endpoint is unauthenticated, so this
    // is the only place the spend is visible before the invoice — and a
    // question costs two hops (ask → tool_calls, results → answer), each one
    // re-sending the whole brief and tool catalogue.
    const u = payload?.usage
    if (u) {
      const reasoned = u.completion_tokens_details?.reasoning_tokens ?? 0
      // The brief and the tool catalogue are byte-identical on every hop, which
      // is what makes them cacheable — worth seeing, because they are most of
      // the input and the cached half is billed at a fraction.
      const cached = u.prompt_tokens_details?.cached_tokens ?? 0
      console.info(
        `[qc/chat] ${model} in=${u.prompt_tokens ?? 0}` +
          (cached ? ` (cached ${cached})` : '') +
          ` out=${u.completion_tokens ?? 0}` +
          (reasoned ? ` (reasoning ${reasoned})` : ''),
      )
    }

    // A refusal can arrive in `error` with a 200 on the wire, the same way
    // Resend does — so this is checked before the status.
    if (payload?.error) {
      return { status: 502, body: { ok: false, error: upstreamError(res.status, payload.error.message ?? '') } }
    }
    if (!res.ok) {
      return { status: 502, body: { ok: false, error: upstreamError(res.status, payload?.error?.message ?? '') } }
    }

    const choice = payload?.choices?.[0]
    const message = choice?.message
    if (!message) return { status: 502, body: { ok: false, error: 'OpenAI-მ პასუხი არ დააბრუნა' } }

    // A reasoning model can spend the whole ceiling thinking and stop with
    // nothing to show. Left alone that renders as an empty bubble, which reads
    // as a broken app rather than a limit worth raising.
    if (!message.content && !message.tool_calls?.length) {
      return {
        status: 502,
        body: {
          ok: false,
          error:
            choice?.finish_reason === 'length'
              ? 'პასუხი ლიმიტს გასცდა — დასვით უფრო კონკრეტული კითხვა'
              : 'ასისტენტმა ცარიელი პასუხი დააბრუნა — სცადეთ თავიდან',
        },
      }
    }

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
