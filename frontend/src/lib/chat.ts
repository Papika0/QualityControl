// Client half of the assistant. Posts to /api/chat — served by the Vite plugin
// in `server/plugin.ts` in development and by the serverless function in
// `api/chat.ts` in production. The OpenAI key lives there, never here.
//
// One question is usually more than one request. The model has no database to
// read, so it answers by asking for data: the server returns `tool_calls`, this
// file runs them against IndexedDB via `api/ai-tools.ts`, appends the results
// and asks again. The loop ends when a turn comes back with prose instead of
// tool calls, or when `MAX_ROUNDS` is spent.

import { TOOL_EXECUTORS, toolLabel, type ToolContext } from '@/api/ai-tools'

/** Tool round-trips before the model is told to answer with what it has. Four
 *  covers "look it up, then look up what that pointed at" twice over; past
 *  that it is looping, not working. */
const MAX_ROUNDS = 4

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

export interface ChatRequestContext {
  role: string
  roleName: string
  personName: string
  projectId: string
  projectName: string
  today: string
}

export interface AskResult {
  ok: boolean
  /** The full exchange including tool traffic, to send back on the next turn. */
  messages: ChatMessage[]
  answer: string
  error?: string
}

interface ServerReply {
  ok: boolean
  message?: ChatMessage
  error?: string
}

async function postTurn(messages: ChatMessage[], context: ChatRequestContext): Promise<ServerReply> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
    })
    const body = (await res.json().catch(() => null)) as ServerReply | null
    if (!res.ok || !body?.ok) return { ok: false, error: body?.error ?? `HTTP ${res.status}` }
    return body
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'ქსელის შეცდომა' }
  }
}

/**
 * Runs one tool call. A failure is reported *to the model* as a tool result
 * rather than thrown, so a bad argument or a missing row makes the assistant
 * say it could not look something up instead of killing the turn.
 */
async function runTool(call: ToolCall, ctx: ToolContext): Promise<ChatMessage> {
  const say = (payload: unknown): ChatMessage => ({
    role: 'tool',
    tool_call_id: call.id,
    content: JSON.stringify(payload),
  })

  const executor = TOOL_EXECUTORS[call.function.name as keyof typeof TOOL_EXECUTORS]
  if (!executor) return say({ error: `უცნობი ინსტრუმენტი: ${call.function.name}` })

  let args: Record<string, unknown>
  try {
    args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {}
  } catch {
    return say({ error: 'არგუმენტები არავალიდური JSON-ია' })
  }

  try {
    return say(await executor(args, ctx))
  } catch (err) {
    return say({ error: err instanceof Error ? err.message : 'ინსტრუმენტი ვერ შესრულდა' })
  }
}

/**
 * Asks one question and returns the answer, running whatever lookups the model
 * needs on the way. `onStep` is called with a Georgian progress line each time
 * a tool runs, so the panel can say what it is doing instead of spinning.
 */
export async function askAssistant(
  history: ChatMessage[],
  question: string,
  context: ChatRequestContext,
  toolCtx: ToolContext,
  onStep?: (label: string) => void,
): Promise<AskResult> {
  const messages: ChatMessage[] = [...history, { role: 'user', content: question }]

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await postTurn(messages, context)
    if (!reply.ok || !reply.message) {
      return { ok: false, messages, answer: '', error: reply.error ?? 'პასუხი ვერ მივიღე' }
    }

    const message = reply.message
    messages.push(message)

    if (!message.tool_calls?.length) {
      return { ok: true, messages, answer: message.content?.trim() || 'პასუხი ცარიელია.' }
    }

    // Calls in one turn are independent by construction — each is a separate
    // read — so they run together rather than in sequence.
    const results = await Promise.all(
      message.tool_calls.map((call) => {
        onStep?.(toolLabel(call.function.name, safeArgs(call)))
        return runTool(call, toolCtx)
      }),
    )
    messages.push(...results)
  }

  // Out of rounds with the model still asking for data. One more turn with no
  // tools offered would be the clean fix, but the server owns the catalogue —
  // so say so plainly rather than return a half-answer as if it were whole.
  return {
    ok: false,
    messages,
    answer: '',
    error: 'კითხვა ძალიან ბევრ ძებნას მოითხოვს — სცადეთ უფრო კონკრეტულად',
  }
}

/** Arguments for the progress label only; a parse failure is not worth an error. */
function safeArgs(call: ToolCall): Record<string, unknown> {
  try {
    return call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// ── links ───────────────────────────────────────────────────────────────────

/**
 * The routes that exist. A link the model invented — a plausible
 * `/projects/9/floors/2`, say — matches none of these and is rendered as plain
 * text instead of a dead link the user would click and land nowhere from.
 *
 * Kept in step with `src/routes/`: adding a route means adding it here, or the
 * assistant simply never links to it.
 */
const ROUTE_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/map(\?.*)?$/,
  /^\/apartments\/[^/?#]+$/,
  /^\/qa(\?.*)?$/,
  /^\/tasks(\?.*)?$/,
  /^\/schedule$/,
  /^\/standards(\?.*)?$/,
  /^\/standards\/[^/?#]+$/,
  /^\/drawings$/,
  /^\/archive(\?.*)?$/,
  /^\/admin$/,
]

export function isAppLink(href: string): boolean {
  return ROUTE_PATTERNS.some((re) => re.test(href))
}
