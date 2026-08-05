/**
 * PDF export.
 *
 * The report is rendered as a standalone HTML document and handed to the
 * browser's print pipeline, where every browser — including iOS Safari's share
 * sheet — offers "Save as PDF". A client-side PDF writer was the alternative
 * and lost: jsPDF's built-in fonts are Latin-1 only, so every Georgian glyph in
 * this app would need a bundled font subset, and the print route renders the
 * same text shaping the screen already uses.
 */

const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;600&family=Noto+Sans+Georgian:wght@400;500;600;700;800&display=swap'

export interface ReportColumn<T> {
  header: string
  cell: (row: T) => string
  align?: 'right' | 'center'
  /** `<col>` width, e.g. `'12%'` — keeps columns stable across page breaks. */
  width?: string
  /** Render in the mono face (ids, dates, amounts). */
  mono?: boolean
}

export interface Report<T = never> {
  /** Document title — browsers use it as the suggested PDF filename. */
  docTitle: string
  title: string
  subtitle?: string
  /** Printed as a label/value strip under the title (project, filters, counts). */
  meta?: { label: string; value: string }[]
  columns?: ReportColumn<T>[]
  rows?: T[]
  /** Prose blocks printed after the table — used by single-record reports. */
  blocks?: { label: string; value: string }[]
  /** Repeated in the page footer next to the timestamp. */
  note?: string
  landscape?: boolean
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]!)

const GE_MONTHS = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ']
const pad2 = (n: number) => String(n).padStart(2, '0')

/** `05 აგვ 2026, 16:40` — the generation stamp printed on every page. */
function stamp(d: Date): string {
  return `${pad2(d.getDate())} ${GE_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Print stylesheet — mirrors the app's tokens in ink-on-paper values. */
function styles(landscape: boolean): string {
  return `
    @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 13mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 22px 26px 40px;
      font-family: "Noto Sans Georgian", "Archivo", system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #16191d; background: #fff; font-size: 12px; line-height: 1.5;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .bar {
      position: sticky; top: 0; display: flex; align-items: center; gap: 10px;
      margin: -22px -26px 22px; padding: 12px 26px;
      background: #f7f8f5; border-bottom: 1px solid #e4e6e1;
    }
    .bar button {
      font: inherit; font-weight: 700; font-size: 12.5px; cursor: pointer;
      border-radius: 8px; padding: 8px 16px; border: 1px solid #dde0da; background: #fff; color: #16191d;
    }
    .bar button.primary { background: #ff4d00; border-color: #ff4d00; color: #fff; }
    .bar span { font-size: 11.5px; color: #6b7480; }
    header { border-bottom: 2px solid #16191d; padding-bottom: 12px; margin-bottom: 16px; }
    .crumb {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 10.5px; letter-spacing: .04em; color: #6b7480; text-transform: uppercase;
    }
    h1 { font-size: 21px; font-weight: 800; margin: 6px 0 0; letter-spacing: -.01em; }
    .sub { font-size: 12px; color: #5a646b; margin-top: 3px; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px 10px; margin-top: 12px; }
    .meta div {
      border: 1px solid #e4e6e1; border-radius: 999px; padding: 3px 11px;
      font-size: 10.5px; background: #f7f8f5;
    }
    .meta b { font-weight: 700; }
    .meta span { color: #6b7480; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th {
      text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: #5a646b; padding: 7px 8px;
      border-bottom: 1.5px solid #16191d; white-space: nowrap;
    }
    td { padding: 7px 8px; border-bottom: 1px solid #eceee9; vertical-align: top; font-size: 11px; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    tbody tr:nth-child(even) td { background: #f9faf7; }
    .mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 10.5px; }
    .r { text-align: right; }
    .c { text-align: center; }
    .blocks { margin-top: 18px; }
    .block { break-inside: avoid; border: 1px solid #e4e6e1; border-radius: 9px; padding: 11px 13px; margin-bottom: 9px; }
    .block .label {
      font-size: 9.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: #5a646b; margin-bottom: 4px;
    }
    .block .value { font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
    .empty { padding: 26px; text-align: center; color: #6b7480; border: 1px dashed #dde0da; border-radius: 10px; }
    footer {
      margin-top: 22px; padding-top: 10px; border-top: 1px solid #e4e6e1;
      display: flex; justify-content: space-between; gap: 16px;
      font-size: 10px; color: #6b7480;
    }
    @media print {
      body { padding: 0; }
      .bar { display: none; }
    }
  `
}

function buildHtml<T>(r: Report<T>): string {
  const columns = r.columns ?? []
  const rows = r.rows ?? []
  const now = stamp(new Date())

  const meta = (r.meta ?? [])
    .map((m) => `<div><span>${esc(m.label)}:</span> <b>${esc(m.value)}</b></div>`)
    .join('')

  const table =
    columns.length === 0
      ? ''
      : rows.length === 0
        ? '<div class="empty">ჩანაწერი არ მოიძებნა</div>'
        : `<table>
             <colgroup>${columns.map((c) => `<col${c.width ? ` style="width:${c.width}"` : ''}>`).join('')}</colgroup>
             <thead><tr>${columns
               .map((c) => `<th class="${c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : ''}">${esc(c.header)}</th>`)
               .join('')}</tr></thead>
             <tbody>${rows
               .map(
                 (row) =>
                   `<tr>${columns
                     .map((c) => {
                       const cls = [c.mono ? 'mono' : '', c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : '']
                         .filter(Boolean)
                         .join(' ')
                       return `<td${cls ? ` class="${cls}"` : ''}>${esc(c.cell(row))}</td>`
                     })
                     .join('')}</tr>`,
               )
               .join('')}</tbody>
           </table>`

  const blocks = (r.blocks ?? []).length
    ? `<div class="blocks">${(r.blocks ?? [])
        .map((b) => `<div class="block"><div class="label">${esc(b.label)}</div><div class="value">${esc(b.value)}</div></div>`)
        .join('')}</div>`
    : ''

  return `<!doctype html>
<html lang="ka">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.docTitle)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${styles(!!r.landscape)}</style>
</head>
<body>
  <div class="bar">
    <button type="button" id="__print" class="primary">ბეჭდვა / PDF-ად შენახვა</button>
    <button type="button" id="__close">დახურვა</button>
    <span>ბეჭდვის ფანჯარაში აირჩიეთ დანიშნულება „Save as PDF“</span>
  </div>
  <header>
    ${r.subtitle ? `<div class="crumb">${esc(r.subtitle)}</div>` : ''}
    <h1>${esc(r.title)}</h1>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
  </header>
  ${table}
  ${blocks}
  <footer>
    <span>${esc(r.note ?? '')}</span>
    <span>დოკუმენტი დაგენერირდა: ${esc(now)}</span>
  </footer>
</body>
</html>`
}

/** Prints once fonts have settled, so Georgian text isn't measured mid-swap. */
function printWhenReady(win: Window) {
  const go = () => {
    try {
      win.focus()
      win.print()
    } catch {
      /* the window was closed before the dialog opened — nothing to do */
    }
  }
  const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts
  if (fonts) {
    // Never block on the webfont: fall back to the system Georgian face.
    void Promise.race([fonts.ready, new Promise((res) => win.setTimeout(res, 1200))]).then(() =>
      win.setTimeout(go, 60),
    )
  } else {
    win.setTimeout(go, 300)
  }
}

/**
 * Renders `report` and opens the print dialog.
 *
 * Returns how it was delivered so callers can say the right thing: `'window'`
 * when a print preview tab opened, `'inline'` when a popup blocker forced the
 * hidden-iframe path (the print dialog still opens, just over this page).
 */
export function exportReport<T>(report: Report<T>): 'window' | 'inline' {
  const html = buildHtml(report)

  // Opened synchronously inside the click handler — anything async here is
  // treated as an unsolicited popup and blocked.
  const win = window.open('', '_blank', 'width=1100,height=800')
  if (win?.document) {
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.document.getElementById('__print')?.addEventListener('click', () => win.print())
    win.document.getElementById('__close')?.addEventListener('click', () => win.close())
    printWhenReady(win)
    return 'window'
  }

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  frame.srcdoc = html
  frame.addEventListener('load', () => {
    const w = frame.contentWindow
    if (w) printWhenReady(w)
    // The dialog is modal to the tab, so there is no reliable "done" event on
    // every browser — reclaim the frame well after any realistic print.
    window.setTimeout(() => frame.remove(), 120_000)
  })
  document.body.appendChild(frame)
  return 'inline'
}
