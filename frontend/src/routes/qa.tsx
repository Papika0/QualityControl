import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CircleCheck, Lock, Plus } from 'lucide-react'
import { defectsQuery } from '@/api/queries'
import { CATS, DEFECT_FLOW, TODAY, type Defect, type DefectStatus, type Priority } from '@/data/domain'
import { useSession } from '@/lib/session'
import { useToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Chip } from '@/components/ui/chip'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DefectDialog } from '@/components/defect-dialog'
import { NewDefectDialog } from '@/components/new-defect-dialog'

const STATUSES = DEFECT_FLOW

type SortKey = 'due' | 'pri' | 'st' | 'cat' | 'id'

const SORT_LABEL: Record<SortKey, string> = {
  due: 'ვადა',
  pri: 'პრიორიტეტი',
  st: 'სტატუსი',
  cat: 'კატეგორია',
  id: 'ID',
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

const PRI_DOT: Record<Priority, string> = { high: '#C0361F', med: '#92670A', low: '#8A949B' }
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
      due: (a, b) => a.due.localeCompare(b.due),
      pri: (a, b) => PRI_WEIGHT[a.pri] - PRI_WEIGHT[b.pri],
      st: (a, b) => STATUSES.indexOf(a.st) - STATUSES.indexOf(b.st),
      cat: (a, b) => a.cat.localeCompare(b.cat),
      id: (a, b) => a.id.localeCompare(b.id),
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

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        crumb={`${project.id} / QA/QC`}
        title="ხარვეზების ჟურნალი"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                toast({
                  kind: 'ok',
                  title: 'PDF ექსპორტი მომზადდა',
                  desc: `${rows.length} ჩანაწერი · ${project.name}`,
                })
              }
            >
              PDF ექსპორტი
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> ხარვეზი
            </Button>
          </>
        }
      />

      {isSub && (
        <div className="mb-3.5 rounded-[10px] border border-[#F3D8BC] bg-[#FFF6ED] px-4 py-2.75 text-[12.5px] text-[#8A5A18]">
          🔒 Record-level წვდომა — ხედავთ მხოლოდ თქვენს კომპანიაზე („შპს ალიანს-მშენი") მიბმულ
          ჩანაწერებს. ფინანსური ველები დამალულია.
        </div>
      )}

      {role?.canFinance && (
        <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[11px] border border-line border-l-[3px] border-l-[#C98A00] bg-card px-4 py-2.75">
          <Lock className="h-3.75 w-3.75 text-[#C98A00]" />
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

      <div className="mb-3.5 flex flex-wrap items-center gap-1.75">
        <Chip active={noFilter} onClick={() => navigate({ search: {}, replace: true })}>
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
          <Chip active onClick={() => setFilter({ cat: undefined })}>
            კატეგორია: {search.cat} ✕
          </Chip>
        )}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="დალაგება"
            className="cursor-pointer rounded-full border border-line-2 bg-card px-3 py-1.5 text-xs font-semibold text-mut-3"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                დალაგება: {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="text-xs text-mut-2">ნაპოვნია: {rows.length}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border-[1.5px] border-dashed border-line-2 bg-card px-5 py-10 text-center">
          <CircleCheck className="mx-auto mb-2.5 h-8.5 w-8.5 stroke-[1.8] text-ok" />
          <div className="text-sm font-bold">ამ ფილტრში ჩანაწერი არ არის</div>
          <div className="mt-1 text-xs text-mut-2">ყველა შესაბამისი ხარვეზი დახურულია</div>
          <button
            className="mt-3.5 cursor-pointer rounded-full border border-line-2 bg-card px-4 py-2 text-xs font-semibold hover:border-brand hover:text-brand-dark"
            onClick={() => navigate({ search: {}, replace: true })}
          >
            ფილტრის გასუფთავება
          </button>
        </div>
      ) : (
        // Virtualized card list — the prototype's row-cards, windowed so 300+
        // defects stay smooth.
        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
          <div
            className="relative min-w-240"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const d = rows[vi.index]!
              const late = d.due < TODAY && d.st !== 'დახურული'
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  style={{ transform: `translateY(${vi.start}px)`, height: ROW_SIZE - 8 }}
                  className={cn(
                    'absolute left-0 flex w-full cursor-pointer items-center gap-3 rounded-[11px] border border-line bg-card px-3.75 text-left transition-all hover:-translate-y-px hover:border-[#FF9A6B] hover:shadow-[0_4px_14px_rgba(20,24,28,0.06)]',
                    d.id === flashId && 'border-brand-ring bg-brand-soft ring-2 ring-brand-ring',
                  )}
                >
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: PRI_DOT[d.pri] }}
                  />
                  <span className="min-w-24 flex-none font-mono text-[11.5px] text-mut">{d.id}</span>
                  <span className="min-w-21.5 text-[13px] font-bold">{d.cat}</span>
                  <span className="min-w-14 text-xs text-mut-3">{d.apt}</span>
                  <span className="min-w-24 text-xs text-mut">{d.room}</span>
                  <span className="min-w-32.5 flex-1 truncate text-xs text-mut-3">
                    {d.sub} · {d.who}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${late ? 'text-danger' : 'text-mut'}`}
                  >
                    {d.due}
                  </span>
                  <StatusBadge status={d.st} className="min-w-18.5 justify-center" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      <DefectDialog defect={selected} onClose={() => setSelectedId(null)} />
      {creating && (
        <NewDefectDialog
          onClose={() => setCreating(false)}
          onCreated={(d) => {
            // Drop any filter that would hide the row, then reveal it.
            navigate({ search: {}, replace: true })
            setFlashId(d.id)
          }}
        />
      )}
    </div>
  )
}
