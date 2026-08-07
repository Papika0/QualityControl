// Client half of the assignment email. Posts to /api/notify-defect — served by
// the Vite plugin in `server/plugin.ts` in development and by the serverless
// function in `api/notify-defect.ts` in production. The Resend key lives there,
// never here.
//
// Sending is deliberately not part of the defect mutation: the record is on
// disk before this runs, so a dead network or a rejected recipient costs the
// notice, never the defect.

import type { Priority } from '@/data/domain'
import type { PreparedPhoto } from './image'

/** Photos attached to the mail. The rest stay in the record for the platform. */
const MAX_ATTACHED = 3

export interface DefectNotice {
  /** QA member id from `QA_TEAM` — the server maps it to a mailbox. */
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
  /** Manually added addresses copied on the notice. The server re-validates. */
  cc?: string[]
  photos?: PreparedPhoto[]
}

/**
 * Blob → base64, via FileReader's data URL. Chunking through
 * `String.fromCharCode` on a byte array blows the argument limit on a 500KB
 * photo; the reader has no such ceiling.
 */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      const comma = url.indexOf(',')
      resolve(comma === -1 ? '' : url.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('photo encode failed'))
    reader.readAsDataURL(blob)
  })
}

export interface NoticeResult {
  ok: boolean
  /** Assignee's address, echoed back so the toast can name it. */
  to?: string
  /** The manual addresses that survived server-side validation. */
  cc?: string[]
  error?: string
}

export async function sendDefectNotice(notice: DefectNotice): Promise<NoticeResult> {
  const { photos = [], ...rest } = notice
  try {
    const attached = await Promise.all(
      photos.slice(0, MAX_ATTACHED).map(async (p) => ({
        name: p.name.toLowerCase().endsWith('.jpg') ? p.name : `${p.id}.jpg`,
        data: await toBase64(p.blob),
      })),
    )

    // `?id=` is the QA route's deep link: it opens that defect's dialog on
    // arrival and then strips itself from the URL. Linking to bare /qa only got
    // the recipient as far as a 500-row list.
    const link = `${location.origin}/qa?id=${encodeURIComponent(rest.id)}`

    const res = await fetch('/api/notify-defect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rest, link, photos: attached }),
    })

    const body = (await res.json().catch(() => null)) as NoticeResult | null
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `HTTP ${res.status}` }
    }
    return { ok: true, to: body.to, cc: body.cc }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'ქსელის შეცდომა' }
  }
}
