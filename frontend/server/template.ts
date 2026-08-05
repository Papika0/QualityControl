// The assignment notice, as HTML and as plain text.
//
// Written to the lowest common denominator of email clients: one 600px table,
// no flexbox, no grid, no <style> block, every rule inline. Gmail strips head
// styles and Outlook renders through Word, so anything cleverer than a nested
// table degrades into a column of unstyled text on somebody's phone.
//
// Georgian needs an explicit fallback in the stack — Sylfaen ships with Windows
// and BPG/Noto cover the rest; without it Outlook drops to a font with no
// Georgian glyphs and the whole body renders as boxes.

import type { QaMember } from './team'

const FONT =
  "'Segoe UI', Roboto, 'Helvetica Neue', Arial, Sylfaen, 'Noto Sans Georgian', sans-serif"

const BRAND = '#ff4d00'
const INK = '#16191d'
const MUT = '#6b7480'
const LINE = '#e4e6e1'
const PAGE = '#f2f3ef'

export type Priority = 'high' | 'med' | 'low'

const PRI: Record<Priority, { label: string; fg: string; bg: string }> = {
  high: { label: 'მაღალი', fg: '#c0361f', bg: '#fbe5e1' },
  med: { label: 'საშუალო', fg: '#92670a', bg: '#f6edd6' },
  low: { label: 'დაბალი', fg: '#2447c6', bg: '#e5ebfc' },
}

export interface DefectMail {
  /** Defect id, e.g. `QA-1204-017`. */
  id: string
  project: string
  apt: string
  floor: string
  room: string
  cat: string
  pri: Priority
  sub: string
  /** Deadline as `YYYY-MM-DD`. */
  due: string
  desc: string
  /** Who filed it — the role name from the session. */
  filedBy: string
  /** Deep link back into the platform. Omitted when the origin is unknown. */
  link?: string
  photoCount: number
}

/** `&`-first, so an already-escaped entity is not double-escaped. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** `2026-08-19` → `19.08.2026`. Anything unparseable passes through as-is. */
function date(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

/**
 * Whole days from today to the deadline, in UTC so a run either side of
 * midnight local time cannot shift the count by one.
 */
function daysLeft(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const due = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((due - today) / 86_400_000)
}

function dueNote(iso: string): string {
  const left = daysLeft(iso)
  if (left === null) return ''
  if (left < 0) return `ვადა გადაცილებულია ${Math.abs(left)} დღით`
  if (left === 0) return 'ვადა დღეს იწურება'
  if (left === 1) return 'დარჩა 1 დღე'
  return `დარჩა ${left} დღე`
}

/** One label/value line of the detail block. */
function row(label: string, value: string, opts: { last?: boolean } = {}): string {
  const border = opts.last ? 'none' : `1px solid ${LINE}`
  return `
          <tr>
            <td style="padding:11px 0;border-bottom:${border};font-family:${FONT};font-size:12px;color:${MUT};white-space:nowrap;vertical-align:top;width:38%;">${esc(label)}</td>
            <td style="padding:11px 0;border-bottom:${border};font-family:${FONT};font-size:13px;font-weight:600;color:${INK};text-align:right;vertical-align:top;">${value}</td>
          </tr>`
}

export function subject(d: DefectMail): string {
  return `[${d.id}] ახალი ხარვეზი — ბინა ${d.apt} · ${PRI[d.pri].label} პრიორიტეტი`
}

export function html(d: DefectMail, to: QaMember): string {
  const pri = PRI[d.pri]
  const note = dueNote(d.due)
  // Shown in the inbox list next to the subject. Kept off-screen in the body by
  // zero font-size; the run of &zwnj;&nbsp; stops clients from pulling the
  // header text in after it.
  const preheader = `${d.cat} · ბინა ${d.apt}, ${d.room} · ვადა ${date(d.due)}`

  const button = d.link
    ? `
        <tr>
          <td style="padding:4px 0 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:8px;background:${BRAND};">
                  <a href="${esc(d.link)}" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">ხარვეზის ნახვა პლატფორმაზე</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : ''

  const photos = d.photoCount
    ? `
        <tr>
          <td style="padding:0 0 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:10px;background:#ffffff;">
              <tr>
                <td style="padding:13px 16px;font-family:${FONT};font-size:12.5px;color:${MUT};">
                  <span style="color:${INK};font-weight:700;">${d.photoCount} ფოტო</span> — თან ერთვის ამ წერილს
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : ''

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px;">

      <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;font-size:1px;color:${PAGE};">${esc(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;border-collapse:collapse;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">

        <!-- header -->
        <tr>
          <td style="background:${INK};padding:20px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${FONT};font-size:14px;font-weight:800;color:#ffffff;letter-spacing:-0.2px;">
                  <span style="color:${BRAND};">■</span>&nbsp; QC Platform
                </td>
                <td align="right" style="font-family:${FONT};font-size:11px;color:#98a2a8;">${esc(d.project)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- title -->
        <tr>
          <td style="padding:30px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:20px;background:${pri.bg};padding:5px 12px;font-family:${FONT};font-size:10.5px;font-weight:800;color:${pri.fg};letter-spacing:0.06em;text-transform:uppercase;">${esc(pri.label)} პრიორიტეტი</td>
              </tr>
            </table>
            <div style="height:14px;line-height:14px;">&nbsp;</div>
            <div style="font-family:${FONT};font-size:22px;line-height:1.3;font-weight:800;color:${INK};letter-spacing:-0.4px;">თქვენზეა მიბმული ახალი ხარვეზი</div>
            <div style="height:6px;line-height:6px;">&nbsp;</div>
            <div style="font-family:${FONT};font-size:13px;color:${MUT};">
              გამარჯობა, ${esc(to.name.split(' ')[0] ?? to.name)} — ხარვეზი
              <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12.5px;font-weight:700;color:${INK};">${esc(d.id)}</span>
              დაფიქსირდა და თქვენ ხართ პასუხისმგებელი QA.
            </div>
          </td>
        </tr>

        <tr><td style="padding:24px 32px 0;"><div style="height:1px;background:${LINE};line-height:1px;font-size:0;">&nbsp;</div></td></tr>

        <!-- details -->
        <tr>
          <td style="padding:4px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${row('ბინა / სართული', `${esc(d.apt)} <span style="color:${MUT};font-weight:400;">·</span> სართული ${esc(d.floor)}`)}
${row('ოთახი', esc(d.room))}
${row('კატეგორია', esc(d.cat))}
${row('შემსრულებელი', esc(d.sub))}
${row('დამფიქსირებელი', esc(d.filedBy))}
${row(
  'ვადა',
  `${esc(date(d.due))}${note ? `<br><span style="font-size:11px;font-weight:600;color:${daysLeft(d.due)! < 2 ? pri.fg : MUT};">${esc(note)}</span>` : ''}`,
  { last: true },
)}
            </table>
          </td>
        </tr>

        <!-- corrective action -->
        <tr>
          <td style="padding:24px 32px 0;">
            <div style="font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUT};padding-bottom:8px;">გამოსასწორებელი ღონისძიება</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
              <tr>
                <td style="background:#fbfaf6;border:1px solid #eae4d4;border-left:3px solid ${BRAND};border-radius:8px;padding:15px 17px;font-family:${FONT};font-size:13px;line-height:1.65;color:#3a3a36;">${esc(d.desc).replace(/\n/g, '<br>')}</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${photos}${button}
            </table>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td style="background:#fbfcfa;border-top:1px solid ${LINE};padding:18px 32px;font-family:${FONT};font-size:11px;line-height:1.6;color:#98a2a8;">
            ავტომატური შეტყობინება QC Platform-იდან — ${esc(d.project)}.<br>
            პასუხის გაცემა არ არის საჭირო; სტატუსი განახლდება პლატფორმაზე.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>`
}

/** Plain-text alternative — what a text-only client and most spam filters read. */
export function text(d: DefectMail, to: QaMember): string {
  const note = dueNote(d.due)
  return [
    `QC Platform — ${d.project}`,
    '',
    `გამარჯობა, ${to.name}.`,
    `თქვენზეა მიბმული ახალი ხარვეზი: ${d.id}`,
    '',
    `პრიორიტეტი:    ${PRI[d.pri].label}`,
    `ბინა/სართული:  ${d.apt} · სართული ${d.floor}`,
    `ოთახი:         ${d.room}`,
    `კატეგორია:     ${d.cat}`,
    `შემსრულებელი:  ${d.sub}`,
    `დამფიქსირებელი: ${d.filedBy}`,
    `ვადა:          ${date(d.due)}${note ? ` (${note})` : ''}`,
    '',
    'გამოსასწორებელი ღონისძიება:',
    d.desc,
    '',
    d.photoCount ? `თან ერთვის ${d.photoCount} ფოტო.` : '',
    d.link ? `ხარვეზის ნახვა: ${d.link}` : '',
    '',
    'ავტომატური შეტყობინება — პასუხის გაცემა არ არის საჭირო.',
  ]
    .filter((l) => l !== '')
    .join('\n')
}
