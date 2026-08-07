import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { TODAY } from '@/data/domain'
import { askAssistant, isAppLink, type ChatMessage } from '@/lib/chat'
import { useSession, useTaskActor } from '@/lib/session'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'

interface Bubble {
  role: 'user' | 'assistant'
  text: string
  failed?: boolean
}

/**
 * The thread outlives the panel: closing it to go and look at something and
 * coming back is the normal way this gets used, and losing the conversation to
 * that would make it useless. It does *not* outlive a change of who is asking —
 * answers are scoped to a role, a person and a project, so `key` resets the
 * thread whenever any of the three moves.
 */
const store: { key: string; bubbles: Bubble[]; history: ChatMessage[] } = {
  key: '',
  bubbles: [],
  history: [],
}

/** Openers, tuned to what the role can actually act on. */
function startersFor(role: string | undefined): string[] {
  const floor = 'მე-12 სართულის სტატუსი'
  switch (role) {
    case 'qa':
    case 'techsup':
      return ['რა არის ჩემი დღევანდელი მიზანი?', 'ჩემი ვადაგადაცილებული ხარვეზები', floor]
    case 'pm':
      return ['რა უნდა გავაკეთო დღეს?', 'რომელი მოთხოვნები ელოდება გამოქვეყნებას?', floor]
    case 'techdir':
      return ['რას ველოდები ტექნიკურ დადასტურებაზე?', 'ტექნიკური ნაკადის დავალებები', floor]
    default:
      return ['პროექტის ზოგადი მდგომარეობა', 'ვადაგადაცილებული ხარვეზები', floor]
  }
}

// ── answer rendering ────────────────────────────────────────────────────────

/** `[text](/path)` and `**bold**`, which is all the model is asked to emit. */
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g

function Inline({ text, onGo }: { text: string; onGo: (href: string) => void }) {
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0

  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const [, label, href, bold] = m

    if (bold) {
      parts.push(
        <strong key={parts.length} className="font-semibold text-ink">
          {bold}
        </strong>,
      )
    } else if (label && href && isAppLink(href)) {
      parts.push(
        <button
          key={parts.length}
          onClick={() => onGo(href)}
          className="cursor-pointer font-semibold text-brand underline decoration-brand/35 underline-offset-2 hover:decoration-brand"
        >
          {label}
        </button>,
      )
    } else {
      // A link to a route that does not exist — the model invented it. Show the
      // words, drop the link, so nothing is clickable that goes nowhere.
      parts.push(label ?? m[0])
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function Answer({ text, onGo }: { text: string; onGo: (href: string) => void }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return null
        const bullet = /^([-*•]|\d+\.)\s+/.exec(trimmed)
        if (bullet) {
          return (
            <div key={i} className="flex gap-1.75 pl-0.5">
              <span className="select-none text-mut-2">•</span>
              <span className="min-w-0 flex-1">
                <Inline text={trimmed.slice(bullet[0].length)} onGo={onGo} />
              </span>
            </div>
          )
        }
        return (
          <p key={i}>
            <Inline text={trimmed} onGo={onGo} />
          </p>
        )
      })}
    </div>
  )
}

// ── panel ───────────────────────────────────────────────────────────────────

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const { role, person, project } = useSession()
  const actor = useTaskActor()
  const navigate = useNavigate()

  const key = `${role?.id ?? ''}:${person?.id ?? ''}:${project.id}`
  if (store.key !== key) {
    store.key = key
    store.bubbles = []
    store.history = []
  }

  const [bubbles, setBubbles] = useState<Bubble[]>(store.bubbles)
  const [draft, setDraft] = useState('')
  const [step, setStep] = useState<string | null>(null)
  const busy = step !== null

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [bubbles, step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /**
   * Follows a link out of an answer. TanStack types `to` as the union of known
   * routes, but these hrefs are strings built by the tools — validated against
   * the same route table by `isAppLink` before they ever get here — so the one
   * cast buys back a typed router everywhere else.
   */
  const go = useCallback(
    (href: string) => {
      const [path, qs] = href.split('?')
      // Search values arrive as text; the routes' `validateSearch` expects the
      // JSON-ish shapes TanStack parses out of a real URL (`floor` a number,
      // `overdue` a boolean), so they are coerced the same way here.
      const search: Record<string, unknown> = {}
      for (const [k, v] of new URLSearchParams(qs ?? '')) {
        try {
          search[k] = JSON.parse(v) as unknown
        } catch {
          search[k] = v
        }
      }
      onClose()
      const nav = navigate as unknown as (opts: { to: string; search?: unknown }) => void
      nav({ to: path ?? '/', ...(qs ? { search } : {}) })
    },
    [navigate, onClose],
  )

  const send = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || busy) return

      setDraft('')
      const next = [...store.bubbles, { role: 'user' as const, text: q }]
      store.bubbles = next
      setBubbles(next)
      setStep('ვფიქრობ…')

      const result = await askAssistant(
        store.history,
        q,
        {
          role: role?.id ?? '',
          roleName: role?.name ?? '',
          personName: person?.name ?? '',
          projectId: project.id,
          projectName: project.name,
          today: TODAY,
        },
        { actor, proj: project.id },
        setStep,
      )

      // The tool traffic is kept so a follow-up question does not re-fetch what
      // the model already knows; only on failure is the turn discarded, or the
      // next question would inherit a dead half-exchange.
      if (result.ok) store.history = result.messages
      store.bubbles = [
        ...next,
        { role: 'assistant', text: result.ok ? result.answer : (result.error ?? 'შეცდომა'), failed: !result.ok },
      ]
      setBubbles(store.bubbles)
      setStep(null)
    },
    [actor, busy, person, project, role],
  )

  const reset = () => {
    store.bubbles = []
    store.history = []
    setBubbles([])
    inputRef.current?.focus()
  }

  const starters = startersFor(role?.id)

  return (
    <>
      <div className="fixed inset-0 z-150 bg-[rgba(14,18,22,0.35)]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-160 flex w-full flex-col border-l border-line bg-card text-ink shadow-[0_20px_60px_rgba(14,20,26,0.28)] sm:w-[min(440px,100vw)]">
        <header className="flex flex-none items-center gap-2 border-b border-line-soft bg-card-2 px-3.5 py-3">
          <Sparkles className="h-4 w-4 flex-none text-brand" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold leading-tight">ასისტენტი</div>
            <div className="truncate text-[10.5px] text-mut-2">
              {person?.name ?? role?.name} · {project.name}
            </div>
          </div>
          <button
            onClick={reset}
            disabled={!bubbles.length || busy}
            title="მიმოწერის გასუფთავება"
            className="grid h-7.5 w-7.5 cursor-pointer place-items-center rounded-lg text-mut-3 hover:bg-soft disabled:cursor-default disabled:opacity-35"
          >
            <RotateCcw className="h-3.75 w-3.75" />
          </button>
          <button
            onClick={onClose}
            title="დახურვა"
            className="grid h-7.5 w-7.5 cursor-pointer place-items-center rounded-lg text-mut-3 hover:bg-soft"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3.5">
          {!bubbles.length && (
            <div className="pt-2">
              <p className="text-[12.5px] leading-relaxed text-mut">
                კითხეთ პროექტზე — ბინა, სართული, ხარვეზი, დავალება ან სტანდარტი. პასუხს ბმული
                მოჰყვება იმ ეკრანზე, სადაც ეს მონაცემი ცხოვრობს.
              </p>
              <div className="mt-3 space-y-1.5">
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="w-full cursor-pointer rounded-lg border border-line-2 bg-soft px-3 py-2 text-left text-[12.5px] hover:border-mut-2"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {bubbles.map((b, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[92%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed',
                b.role === 'user'
                  ? 'ml-auto bg-brand-soft text-brand-dark'
                  : b.failed
                    ? 'border border-tone-danger-line bg-tone-danger-soft text-tone-danger-ink'
                    : 'bg-soft',
              )}
            >
              {b.role === 'assistant' && !b.failed ? <Answer text={b.text} onGo={go} /> : b.text}
            </div>
          ))}

          {step && (
            <div className="flex items-center gap-2 px-1 text-[11.5px] text-mut-2">
              <Loader2 className="h-3.25 w-3.25 animate-spin" />
              {step}
            </div>
          )}
        </div>

        <div className="flex-none border-t border-line-soft p-2.5">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              rows={1}
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
              placeholder="დაწერეთ შეკითხვა…"
              className="max-h-32 min-h-9 resize-none py-2 text-[12.5px]"
            />
            <button
              onClick={() => void send(draft)}
              disabled={busy || !draft.trim()}
              title="გაგზავნა"
              className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-lg bg-brand text-white disabled:cursor-default disabled:opacity-35"
            >
              <Send className="h-3.75 w-3.75" />
            </button>
          </div>
          <p className="px-1 pt-1.5 text-[10px] text-mut-2">
            პასუხები ეყრდნობა მხოლოდ იმ მონაცემს, რომელსაც თქვენ ხედავთ.
          </p>
        </div>
      </aside>
    </>
  )
}
