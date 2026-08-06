import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CircleCheck, FileDown, Lock, Plus, ShieldCheck, X } from 'lucide-react'
import { defectsQuery } from '@/api/queries'
import { CATS, DEFECT_FLOW, PRI_DOT, PRI_LABEL, TODAY, type Defect, type DefectStatus, type Priority } from '@/data/domain'
import { useSession } from '@/lib/session'
import { useToast } from '@/lib/toast'
import { exportReport } from '@/lib/pdf'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Chip } from '@/components/ui/chip'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DefectDialog } from '@/components/defect-dialog'
import { NewDefectDialog } from '@/components/new-defect-dialog'

const STATUSES = DEFECT_FLOW

type SortKey = 'due' | 'pri'

const SORT_LABEL: Record<SortKey, string> = {
  due: 'ვადა',
  pri: 'პრიორიტეტი',
}

// Typed search params — filters live in the URL, so filtered views are linkable.
// `id` deep-links a single defect, which is how search and notifications open one.
interface QaSearch {
  st?: DefectStatus
  pri?: Priority
  overdue?: boolean
  cat?: string
  id?: string
}

export const Route = createFileRoute('/qa')({
  validateSearch: (search: Record<string, unknown>): QaSearch => ({
    st: STATUSES.includes(search.st as DefectStatus) ? (search.st as DefectStatus) : undefined,
    pri: ['high', 'med', 'low'].includes(search.pri as string) ? (search.pri as Priority) : undefined,
    overdue: search.overdue === true || undefined,
    cat: (CATS as readonly string[]).includes(search.cat as string) ? (search.cat as string) : undefined,
    id: typeof search.id === 'string' ? search.id : undefined,
  }),
  component: QaPage,
})

const PRI_WEIGHT: Record<Priority, number> = { high: 0, med: 1, low: 2 }

/** Retention held back per subcontractor until their defects close. Finance roles only. */
const RETENTION_CHIPS = [
  'ალიანს-მშენი $38.2K',
  'ტექნო-ინსტალაცია $24.1K',
  'ფასად-პრო $18.4K',
  'წიკლაური $11.7K',
]

/** Card height + the 8px gap between cards. */
const ROW_SIZE = 56

function QaPage() {
  const { project, role } = useSession()
  const toast = useToast()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: all } = useSuspenseQuery(defectsQuery(project.id))
  // Track the id, not the row: after a status write the list refetches and the
  // open dialog has to show the new value, not the copy it was opened with.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [sort, setSort] = useState<SortKey>('due')
  // A freshly filed defect can land anywhere under the active sort, often below
  // the fold. Remember its id to scroll it into view and flash the card.
  const [flashId, setFlashId] = useState<string | null>(null)

  const isSub = role?.id === 'sub'
  const selected = all.find((d) => d.id === selectedId) ?? null

  const rows = useMemo(() => {
    let list = all
    if (isSub) list = list.filter((d) => d.sub === 'შპს ალიანს-მშენი')
    if (search.st) list = list.filter((d) => d.st === search.st)
    if (search.pri) list = list.filter((d) => d.pri === search.pri)
    if (search.overdue) list = list.filter((d) => d.due < TODAY && d.st !== 'დახურული')
    if (search.cat) list = list.filter((d) => d.cat === search.cat)

    const cmp: Record<SortKey, (a: Defect, b: Defect) => number> = {
      // Nearest deadline first — overdue rows lead, since their date is furthest back.
      due: (a, b) => a.due.localeCompare(b.due) || PRI_WEIGHT[a.pri] - PRI_WEIGHT[b.pri],
      // Highest priority on top, nearest deadline first inside each priority band.
      pri: (a, b) => PRI_WEIGHT[a.pri] - PRI_WEIGHT[b.pri] || a.due.localeCompare(b.due),
    }
    return [...list].sort(cmp[sort])
  }, [all, search, isSub, sort])

  // A `?id=` in the URL opens that defect — the deep-link used by ⌘K and notifications.
  useEffect(() => {
    if (!search.id) return
    if (all.some((d) => d.id === search.id)) setSelectedId(search.id)
    navigate({ search: (prev) => ({ ...prev, id: undefined }), replace: true })
  }, [search.id, all, navigate])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_SIZE,
    overscan: 10,
  })

  const flashIndex = flashId ? rows.findIndex((d) => d.id === flashId) : -1

  useEffect(() => {
    if (flashIndex < 0) return
    virtualizer.scrollToIndex(flashIndex, { align: 'center' })
    const t = setTimeout(() => setFlashId(null), 3000)
    return () => clearTimeout(t)
  }, [flashIndex, virtualizer])

  const setFilter = (patch: Partial<QaSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  const noFilter = !search.st && !search.pri && !search.overdue && !search.cat

  /** Human-readable list of what the current view is narrowed to. */
  const activeFilters = [
    search.st && `სტატუსი: ${search.st}`,
    search.pri && `პრიორიტეტი: ${PRI_LABEL[search.pri]}`,
    search.cat && `კატეგორია: ${search.cat}`,
    search.overdue && 'მხოლოდ ვადაგადაცილებული',
  ].filter(Boolean) as string[]

  const clearFilters = () => {
    navigate({ search: {}, replace: true })
    if (!noFilter) toast({ kind: 'info', title: 'ფილტრი გასუფთავდა', desc: 'ნაჩვენებია ყველა ჩანაწერი' })
  }

  const exportPdf = () => {
    const overdue = rows.filter((d) => d.due < TODAY && d.st !== 'დახურული').length
    const how = exportReport<Defect>({
      docTitle: `QA-ჟურნალი-${project.id}`,
      title: 'ხარვეზების ჟურნალი',
      subtitle: `${project.id} · QA/QC`,
      landscape: true,
      meta: [
        { label: 'პროექტი', value: `${project.name} — ${project.addr}` },
        { label: 'ჩანაწერი', value: String(rows.length) },
        { label: 'ვადაგადაცილებული', value: String(overdue) },
        { label: 'ფილტრი', value: activeFilters.length ? activeFilters.join(' · ') : 'ყველა ჩანაწერი' },
        { label: 'დალაგება', value: SORT_LABEL[sort] },
      ],
      columns: [
        { header: 'ID', width: '8%', mono: true, cell: (d) => d.id },
        // Category and ჯგუფი share a column — apart they would each be too
        // narrow to read, and the pair is what identifies the work item.
        { header: 'კატეგორია', width: '20%', cell: (d) => (d.group ? `${d.cat} — ${d.group}` : d.cat) },
        { header: 'ბინა', width: '5%', cell: (d) => d.apt },
        { header: 'ოთახი', width: '9%', cell: (d) => d.room },
        { header: 'პრიორიტეტი', width: '7%', cell: (d) => PRI_LABEL[d.pri] },
        { header: 'სტატუსი', width: '8%', cell: (d) => d.st },
        { header: 'შემსრულებელი', width: '10%', cell: (d) => d.sub },
        { header: 'პასუხისმგებელი', width: '9%', cell: (d) => d.who },
        {
          header: 'ვადა',
          width: '8%',
          mono: true,
          cell: (d) => (d.due < TODAY && d.st !== 'დახურული' ? `${d.due} (!)` : d.due),
        },
        { header: 'გამოსასწორებელი ღონისძიება', width: '16%', cell: (d) => d.desc },
      ],
      rows,
      note: `${project.name} · ხარისხის კონტროლის პლატფორმა`,
    })
    toast({
      kind: 'ok',
      title: `PDF მომზადდა — ${rows.length} ჩანაწერი`,
      desc:
        how === 'window'
          ? 'ბეჭდვის ფანჯარაში აირჩიეთ „Save as PDF“'
          : 'ბრაუზერმა ახალი ფანჯარა დაბლოკა — ბეჭდვა გაიხსნა აქვე',
    })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        crumb={`${project.id} / QA/QC`}
        title="ხარვეზების ჟურნალი"
        actions={
          <>
            <Button variant="outline" onClick={exportPdf} title="ხარვეზების ჟურნალი PDF-ად">
              <FileDown className="h-4 w-4 flex-none" />
              {/* The label sheds its second word on a phone rather than
                  pushing the header row into an overflow. */}
              <span className="truncate">
                PDF<span className="hidden sm:inline"> ექსპორტი</span>
              </span>
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 flex-none" /> <span className="truncate">ხარვეზი</span>
            </Button>
          </>
        }
      />

      {isSub && (
        <div className="mb-3.5 flex items-start gap-2.5 rounded-[10px] border border-note-line bg-note-bg px-4 py-2.75 text-[12.5px] text-note-label">
          <ShieldCheck className="mt-0.5 h-3.75 w-3.75 flex-none" />
          <span>
            Record-level წვდომა — ხედავთ მხოლოდ თქვენს კომპანიაზე („შპს ალიანს-მშენი") მიბმულ
            ჩანაწერებს. ფინანსური ველები დამალულია.
          </span>
        </div>
      )}

      {role?.canFinance && (
        <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[11px] border border-line border-l-[3px] border-l-warn bg-card px-4 py-2.75">
          <Lock className="h-3.75 w-3.75 text-warn" />
          <span className="text-xs font-bold">
            Retention დაბლოკილია: <span className="text-sm">$92,400</span>
          </span>
          {RETENTION_CHIPS.map((r) => (
            <span
              key={r}
              className="rounded-full bg-soft-2 px-2.5 py-0.75 text-[10.5px] font-semibold text-mut-3"
            >
              {r}
            </span>
          ))}
          <span className="ml-auto text-[11px] text-mut-2">
            იხსნება ხარვეზების დახურვისას — ავტომატურად
          </span>
        </div>
      )}

      {/* Below `sm` the chips ride one edge-to-edge scroll strip — stacking them
          left-aligned over three ragged rows was the mobile eyesore. `sm:contents`
          dissolves the strip on wider screens so they wrap as before. */}
      <div className="mb-3.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.75">
        <div className="no-scrollbar -mx-[clamp(14px,2.6vw,26px)] flex gap-1.75 overflow-x-auto px-[clamp(14px,2.6vw,26px)] sm:contents">
          <Chip active={noFilter} onClick={clearFilters}>
            ყველა
          </Chip>
          {STATUSES.map((s) => (
            <Chip
              key={s}
              active={search.st === s}
              onClick={() => setFilter({ st: search.st === s ? undefined : s, overdue: undefined, pri: undefined })}
            >
              {s}
            </Chip>
          ))}
          <Chip
            active={search.pri === 'high'}
            onClick={() => setFilter({ pri: search.pri === 'high' ? undefined : 'high' })}
          >
            მაღალი
          </Chip>
          <Chip
            active={!!search.overdue}
            onClick={() => setFilter({ overdue: search.overdue ? undefined : true })}
          >
            ვადაგადაცილებული
          </Chip>
          {search.cat && (
            <Chip active onClick={() => setFilter({ cat: undefined })} className="inline-flex items-center gap-1.5">
              კატეგორია: {search.cat} <X className="h-3 w-3" />
            </Chip>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 sm:ml-auto sm:justify-end">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="დალაგება"
            className="min-w-0 cursor-pointer rounded-full border border-line-2 bg-card px-3 py-1.5 text-xs font-semibold text-mut-3"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                დალაგება: {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="whitespace-nowrap text-xs text-mut-2">ნაპოვნია: {rows.length}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border-[1.5px] border-dashed border-line-2 bg-card px-5 py-10 text-center">
          <CircleCheck className="mx-auto mb-2.5 h-8.5 w-8.5 stroke-[1.8] text-ok" />
          <div className="text-sm font-bold">ამ ფილტრში ჩანაწერი არ არის</div>
          <div className="mt-1 text-xs text-mut-2">ყველა შესაბამისი ხარვეზი დახურულია</div>
          <button
            className="mt-3.5 cursor-pointer rounded-full border border-line-2 bg-card px-4 py-2 text-xs font-semibold hover:border-brand hover:text-brand-dark"
            onClick={clearFilters}
          >
            ფილტრის გასუფთავება
          </button>
        </div>
      ) : (
        // Virtualized card list — the prototype's row-cards, windowed so 300+
        // defects stay smooth. The header and the rows share one horizontal
        // scroller so the labels stay over their columns; only the inner box
        // scrolls vertically, which keeps it the virtualizer's scroll element.
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full min-w-275 flex-col">
            {/* Column labels. Widths mirror the card cells below, and the card's
                1px border + px-3.75 padding lines up with this row's px-4. */}
            <div className="mb-2 flex flex-none items-center gap-3 border-b border-line px-4 pb-2.5 text-[12.5px] font-medium text-mut-3">
              <span className="w-24 flex-none">პრიორიტეტი</span>
              <span className="w-24 flex-none">ID</span>
              <span className="w-60 flex-none">კატეგორია · ჯგუფი</span>
              <span className="w-14 flex-none">ბინა</span>
              <span className="w-26 flex-none">ოთახი</span>
              <span className="min-w-32.5 flex-1">შემსრულებელი · პასუხისმგებელი</span>
              <span className="w-19 flex-none">ვადა</span>
              <span className="w-18.5 flex-none text-center">სტატუსი</span>
            </div>

            <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const d = rows[vi.index]!
                  const late = d.due < TODAY && d.st !== 'დახურული'
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      style={{ transform: `translateY(${vi.start}px)`, height: ROW_SIZE - 8 }}
                      className={cn(
                        'absolute left-0 flex w-full cursor-pointer items-center gap-3 rounded-[11px] border border-line bg-card px-3.75 text-left transition-all hover:-translate-y-px hover:border-brand/60 hover:shadow-[0_4px_14px_rgba(20,24,28,0.06)]',
                        d.id === flashId && 'border-brand-ring bg-brand-soft ring-2 ring-brand-ring',
                      )}
                    >
                      {/* Priority as a labelled tag — the bare dot left the level
                          readable only by hue, and hue alone is not a label. */}
                      {/* The pill hugs its label; the wrapper holds the column
                          width so the ID column starts at the same x on every row. */}
                      <span className="flex w-24 flex-none">
                        <span className="flex items-center gap-1.5 rounded-full bg-soft-2 px-2 py-0.75 text-[11px] font-semibold text-mut-3">
                          <span
                            className="h-1.5 w-1.5 flex-none rounded-full"
                            style={{ background: PRI_DOT[d.pri] }}
                          />
                          {PRI_LABEL[d.pri]}
                        </span>
                      </span>
                      <span className="w-24 flex-none font-mono text-[11.5px] text-mut">{d.id}</span>
                      {/* Category over ჯგუფი: the category alone repeats across
                          dozens of rows, and the ჯგუფი is what tells them apart.
                          Both are far too long to sit side by side. */}
                      <span
                        className="flex w-60 min-w-0 flex-none flex-col justify-center"
                        title={d.group ? `${d.cat} — ${d.group}` : d.cat}
                      >
                        <span className="truncate text-[13px] font-bold">{d.cat}</span>
                        {d.group && <span className="truncate text-[11px] text-mut">{d.group}</span>}
                      </span>
                      <span className="w-14 flex-none text-xs text-mut-3">{d.apt}</span>
                      <span className="w-26 flex-none truncate text-xs text-mut">{d.room}</span>
                      <span className="min-w-32.5 flex-1 truncate text-xs text-mut-3">
                        {d.sub} · {d.who}
                      </span>
                      <span
                        className={`w-19 flex-none font-mono text-[11px] font-semibold ${late ? 'text-danger' : 'text-mut'}`}
                      >
                        {d.due}
                      </span>
                      {/* min-, not a fixed width: every current status fits the
                          100px floor and so renders at a uniform size, but a
                          longer one grows the pill instead of spilling its text
                          outside the rounded background — which is what
                          "შემოწმებაზე" did at the old 74px. */}
                      <StatusBadge status={d.st} className="min-w-25 flex-none justify-center" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <DefectDialog defect={selected} onClose={() => setSelectedId(null)} />
      {creating && (
        <NewDefectDialog
          onClose={() => setCreating(false)}
          onCreated={(d) => {
            // Drop any filter that would hide the row, then reveal it. Silently
            // resetting the view is confusing, so say so when it happens.
            const hidden = !noFilter
            navigate({ search: {}, replace: true })
            setFlashId(d.id)
            if (hidden) {
              toast({
                kind: 'info',
                title: 'ფილტრი გასუფთავდა',
                desc: `${d.id} ფილტრს მიღმა იყო — სიაში მონიშნულია`,
              })
            }
          }}
        />
      )}
    </div>
  )
}
