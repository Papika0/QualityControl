// POST /api/notify-defect — mails the QA member a defect was assigned to.
//
// This runs on the server for two reasons: the Resend key must never reach the
// browser, and Resend rejects browser-origin requests outright (no CORS headers
// on the send endpoint), so a fetch straight from React would fail even with a
// key in hand.
//
// `handleNotifyDefect` takes and returns plain values, so the same logic backs
// the Vite dev middleware here and a serverless function in production without
// a second implementation.

import { Resend } from 'resend'
import { memberById } from './team.js'
import { html, subject, text, type DefectMail, type Priority } from './template.js'

/** Attachments beyond this are dropped — the mail is a notice, not an archive. */
const MAX_ATTACHMENTS = 3
/** Total decoded attachment bytes. Resend's own ceiling is 40MB. */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

const PRIORITIES: Priority[] = ['high', 'med', 'low']

/**
 * Ceiling on the hand-added copies. `assignee` is an id the server resolves,
 * but these are raw addresses off the browser — the cap is what stops a
 * tampered request from turning the endpoint into a mailer.
 */
const MAX_CC = 10

/** Same shallow shape check as `src/lib/email.ts`, duplicated deliberately:
 *  this side builds under its own tsconfig, and must not trust the client's. */
const MAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface NotifyPhoto {
  name: string
  /** Base64, no data-URL prefix. */
  data: string
}

export interface NotifyRequest {
  /** QA member id from `team.ts` — not a name, and not an address. A caller
   *  cannot pick who gets mail, only which of the three roster entries. */
  assignee: string
  id: string
  project: string
  apt: string
  floor: string
  room: string
  cat: string
  /** `code — title` of the standard cited, when the filing named one. */
  standard?: string
  pri: Priority
  sub: string
  due: string
  desc: string
  filedBy: string
  link?: string
  /**
   * Extra addresses the inspector added by hand, copied on the notice. Unlike
   * `assignee` these are raw mailboxes typed in the browser, so `parse`
   * validates, dedupes and caps them before any of them reach Resend.
   */
  cc?: string[]
  photos?: NotifyPhoto[]
}

export interface NotifyResult {
  status: number
  body:
    | { ok: true; to: string; cc: string[]; mailId: string | null }
    | { ok: false; error: string }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function parse(raw: unknown): NotifyRequest | string {
  if (!raw || typeof raw !== 'object') return 'ტანი არ არის JSON ობიექტი'
  const b = raw as Record<string, unknown>

  const assignee = str(b.assignee)
  if (!assignee) return 'assignee აკლია'
  if (!memberById(assignee)) return `უცნობი QA: ${assignee}`

  const pri = str(b.pri) as Priority
  if (!PRIORITIES.includes(pri)) return `pri უნდა იყოს ${PRIORITIES.join(' | ')}`

  const id = str(b.id)
  if (!id) return 'id აკლია'

  // Manual copies: validated, lowercased, deduped, and never a second copy to
  // the assignee — who is already the `to`.
  const own = memberById(assignee)!.mail.toLowerCase()
  const cc: string[] = []
  for (const raw of Array.isArray(b.cc) ? b.cc : []) {
    const mail = str(raw).toLowerCase()
    if (!mail) continue
    if (!MAIL_SHAPE.test(mail)) return `არასწორი ელფოსტა: ${mail}`
    if (mail === own || cc.includes(mail)) continue
    if (cc.length >= MAX_CC) return `მაქსიმუმ ${MAX_CC} დამატებითი მიმღები`
    cc.push(mail)
  }

  const photos = Array.isArray(b.photos)
    ? b.photos
        .filter((p): p is NotifyPhoto => !!p && typeof p === 'object' && typeof (p as NotifyPhoto).data === 'string')
        .map((p) => ({ name: str(p.name) || 'photo.jpg', data: p.data }))
    : []

  return {
    assignee,
    id,
    pri,
    project: str(b.project) || 'QC Platform',
    apt: str(b.apt) || '—',
    floor: str(b.floor) || '—',
    room: str(b.room) || '—',
    cat: str(b.cat) || '—',
    standard: str(b.standard) || undefined,
    sub: str(b.sub) || '—',
    due: str(b.due),
    desc: str(b.desc) || '—',
    filedBy: str(b.filedBy) || '—',
    link: str(b.link) || undefined,
    cc,
    photos,
  }
}

/** Base64 decodes to 3 bytes per 4 chars, less the `=` padding. */
function decodedBytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - pad
}

/** Keeps photos in order until either cap is hit, then stops. */
function budget(photos: NotifyPhoto[]): NotifyPhoto[] {
  const kept: NotifyPhoto[] = []
  let bytes = 0
  for (const p of photos.slice(0, MAX_ATTACHMENTS)) {
    const size = decodedBytes(p.data)
    if (bytes + size > MAX_ATTACHMENT_BYTES) break
    kept.push(p)
    bytes += size
  }
  return kept
}

export async function handleNotifyDefect(raw: unknown): Promise<NotifyResult> {
  const parsed = parse(raw)
  if (typeof parsed === 'string') return { status: 400, body: { ok: false, error: parsed } }

  const key = process.env.RESEND_API_KEY
  if (!key) {
    return {
      status: 500,
      body: { ok: false, error: 'RESEND_API_KEY არ არის განსაზღვრული (იხ. frontend/.env)' },
    }
  }

  const to = memberById(parsed.assignee)!
  const attachments = budget(parsed.photos ?? [])

  const mail: DefectMail = { ...parsed, photoCount: attachments.length }

  const bcc = (process.env.QC_MAIL_BCC ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // The hand-added addresses are copied, not addressed: the body greets the
  // assignee by name, and a typed address has no name to greet.
  const cc = parsed.cc ?? []

  try {
    const { data, error } = await new Resend(key).emails.send({
      from: process.env.QC_MAIL_FROM || 'QC Platform <onboarding@resend.dev>',
      to: [to.mail],
      ...(cc.length ? { cc } : {}),
      ...(bcc.length ? { bcc } : {}),
      subject: subject(mail),
      html: html(mail, to),
      text: text(mail, to),
      ...(attachments.length
        ? { attachments: attachments.map((p) => ({ filename: p.name, content: p.data })) }
        : {}),
    })

    // Resend reports delivery refusals (unverified domain, blocked recipient) in
    // `error` with a 200 on the wire, so this branch is the common failure —
    // not the catch below.
    if (error) return { status: 502, body: { ok: false, error: error.message } }
    return { status: 200, body: { ok: true, to: to.mail, cc, mailId: data?.id ?? null } }
  } catch (err) {
    return {
      status: 502,
      body: { ok: false, error: err instanceof Error ? err.message : 'გაგზავნა ვერ მოხერხდა' },
    }
  }
}
