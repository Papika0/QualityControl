import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CornerDownLeft, MousePointerClick, Search, X } from 'lucide-react'
import { apartmentsQuery, defectsQuery } from '@/api/queries'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { StatusBadge } from '@/components/ui/badge'
import { DefectDialog } from '@/components/defect-dialog'
import type { Apartment, Defect } from '@/data/domain'

/** The level shown when the map is drilled into the parking deck. */
const PARKING = -1

/** What the cell color encodes. */
type ColorMode = 'prog' | 'defects'

type FilterKey = 'def' | 'late' | 'done'

interface MapSearch {
  /** Absent → the whole-building elevation. A number → that floor's card grid. */
  floor?: number
  mode?: ColorMode
  filter?: FilterKey
}

const MODES: { id: ColorMode; label: string }[] = [
  { id: 'prog', label: 'პროგრესი' },
  { id: 'defects', label: 'ხარვეზები' },
]

const FILTER_LABEL: Record<FilterKey, string> = {
  def: 'ხარვეზებით',
  late: 'ჩამორჩენილი',
  done: 'დასრულებული',
}

const MATCHES: Record<FilterKey, (a: Apartment) => boolean> = {
  def: (a) => a.defects > 0,
  late: (a) => a.late,
  done: (a) => a.prog >= 100,
}

const FILTER_KEYS = Object.keys(FILTER_LABEL) as FilterKey[]

export const Route = createFileRoute('/map')({
  validateSearch: (search: Record<string, unknown>): MapSearch => ({
    floor: typeof search.floor === 'number' && Number.isFinite(search.floor) ? search.floor : undefined,
    mode: MODES.some((m) => m.id === search.mode) ? (search.mode as ColorMode) : undefined,
    filter: FILTER_KEYS.includes(search.filter as FilterKey) ? (search.filter as FilterKey) : undefined,
  }),
  component: MapPage,
})

/** The shell's 960px breakpoint — `nav:` in classes. */
const DESKTOP = '(min-width: 60rem)'

/**
 * Below `nav:` the map is not just narrower, it behaves differently: a unit cell
 * shrinks to ~16px there, far under a touch target, so the phone layout makes
 * the *floor* the tappable thing and moves unit detail into a sheet. That is a
 * structural difference, not a style one, so it needs a real media query.
 */
function useIsDesktop(): boolean {
  const [is, setIs] = useState(() => window.matchMedia(DESKTOP).matches)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP)
    const on = () => setIs(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return is
}

/** Build state of a unit — the three-way split the progress palette is built on. */
function stateOf(a: Apartment): 'done' | 'late' | 'prog' {
  return a.prog >= 100 ? 'done' : a.late ? 'late' : 'prog'
}

const STATE_LABEL = { done: 'დასრულებული', late: 'ჩამორჩენა', prog: 'მიმდინარე' } as const

/**
 * The fill palette has to be reached through utility classes, spelled out in
 * full: Tailwind only emits a `--color-fill-*` variable when some class it can
 * see in the source uses it, so a `var()` in an inline style — or a class name
 * built by template literal — leaves the light theme with no value at all.
 */
const FILL_CLASS = {
  prog: 'bg-linear-to-b from-fill-prog-a to-fill-prog-b',
  done: 'bg-linear-to-b from-fill-done-a to-fill-done-b',
  late: 'bg-linear-to-b from-fill-late-a to-fill-late-b',
} as const

const SWATCH_CLASS = { prog: 'bg-fill-prog-b', done: 'bg-fill-done-b', late: 'bg-fill-late-b' } as const

/**
 * Open-defect heat, 0 → 3+, as a share of the open tone mixed into the cell.
 * A bare elevation cell can take the full ramp; a card carries labels over the
 * fill, so it gets a muted one that its text still reads against.
 */
const heatMix = (n: number, strong = true) =>
  n === 0
    ? undefined
    : `color-mix(in srgb, var(--color-tone-open-solid) ${
        strong ? Math.min(85, 25 + n * 22) : Math.min(40, 12 + n * 10)
      }%, transparent)`

/**
 * The paint inside a cell. In progress mode the fill rises from the bottom, so a
 * row of cells reads as a bar chart of the floor; defect heat floods the cell
 * because its value is a category, not a magnitude.
 */
function cellFill(
  a: Apartment,
  mode: ColorMode,
  size: 'sm' | 'lg',
): { className: string; style?: React.CSSProperties } {
  if (mode === 'prog') {
    return { className: FILL_CLASS[stateOf(a)], style: { height: `${a.prog}%` } }
  }
  return { className: 'h-full', style: { background: heatMix(a.defects, size === 'sm') } }
}

function MapPage() {
  const { project } = useSession()
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  const { data: apts } = useSuspenseQuery(apartmentsQuery(project.id))
  const { data: allDefects } = useSuspenseQuery(defectsQuery(project.id))
  const isDesktop = useIsDesktop()

  // Hover previews into the detail panel; a click pins it there. Neither belongs
  // in the URL — arrow-key navigation would otherwise flood the history stack.
  const [pinned, setPinned] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [defect, setDefect] = useState<Defect | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const mode = search.mode ?? 'prog'
  const filter = search.filter

  const setSearch = useCallback(
    (patch: MapSearch) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true }),
    [navigate],
  )

  const { byFloor, byNo, floors } = useMemo(() => {
    const m = new Map<number, Apartment[]>()
    const n = new Map<string, Apartment>()
    for (const a of apts) {
      const arr = m.get(a.floor)
      if (arr) arr.push(a)
      else m.set(a.floor, [a])
      n.set(a.no, a)
    }
    return { byFloor: m, byNo: n, floors: [...m.keys()].sort((x, y) => y - x) }
  }, [apts])

  /** Open defects per apartment, for the detail panel. */
  const openByApt = useMemo(() => {
    const m = new Map<string, Defect[]>()
    for (const d of allDefects) {
      if (d.st === 'დახურული') continue
      const arr = m.get(d.apt)
      if (arr) arr.push(d)
      else m.set(d.apt, [d])
    }
    return m
  }, [allDefects])

  const visible = useCallback(
    (a: Apartment) => (!filter || MATCHES[filter](a)) && (!q || a.no.includes(q)),
    [filter, q],
  )

  const stats = useMemo(() => {
    const sum = apts.reduce((s, a) => s + a.prog, 0)
    return {
      avg: apts.length ? Math.round(sum / apts.length) : 0,
      done: apts.filter((a) => a.prog >= 100).length,
      defects: apts.reduce((s, a) => s + a.defects, 0),
      late: apts.filter((a) => a.late).length,
    }
  }, [apts])

  const matchCount = useMemo(() => apts.filter(visible).length, [apts, visible])
  const filtering = !!filter || !!q

  const maxUnits = useMemo(
    () => floors.reduce((m, f) => Math.max(m, byFloor.get(f)?.length ?? 0), 0),
    [floors, byFloor],
  )

  const hasParking = project.id === 'NTB'
  const floorSel = search.floor
  const inParking = floorSel === PARKING
  const drilled = floorSel !== undefined && (inParking || byFloor.has(floorSel))
  const current = drilled && !inParking ? (byFloor.get(floorSel) ?? []) : []

  // Touch has no hover, and the sheet would fight the map if it opened on every
  // stray pointer event — on phones only an explicit tap surfaces a unit.
  const shown = byNo.get((isDesktop ? (pinned ?? hover) : pinned) ?? '') ?? null

  const openApt = useCallback(
    (no: string) => navigate({ to: '/apartments/$aptNo', params: { aptNo: no } }),
    [navigate],
  )

  /** Click previews; clicking the already-pinned unit opens it. */
  const activate = (a: Apartment) => (pinned === a.no ? openApt(a.no) : setPinned(a.no))

  // Arrow keys walk the grid. In the elevation, up/down step between floors at
  // the same stack position; in a floor's card grid they step a full row, whose
  // width auto-fill decides at layout time — so it's read back off the element.
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setPinned(null)
      return
    }
    if (!e.key.startsWith('Arrow')) return
    const active = document.activeElement as HTMLElement | null
    const from = active?.dataset.apt && byNo.get(active.dataset.apt)
    if (!from) return

    const units = byFloor.get(from.floor) ?? []
    const ui = units.findIndex((u) => u.no === from.no)
    let next: Apartment | undefined

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      next = units[ui + (e.key === 'ArrowRight' ? 1 : -1)]
    } else if (drilled) {
      const grid = gridRef.current?.querySelector<HTMLElement>('[data-cells]')
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1
      next = units[ui + (e.key === 'ArrowDown' ? cols : -cols)]
    } else {
      const fi = floors.indexOf(from.floor)
      // `floors` runs top-down, so ArrowUp is the previous entry.
      const target = byFloor.get(floors[fi + (e.key === 'ArrowUp' ? -1 : 1)]!)
      next = target?.[Math.min(ui, target.length - 1)]
    }
    if (!next) return
    e.preventDefault()
    gridRef.current?.querySelector<HTMLElement>(`[data-apt="${next.no}"]`)?.focus()
  }

  const cellProps = (a: Apartment): CellHandlers => ({
    'data-apt': a.no,
    'aria-label': `ბინა ${a.no} · ${a.prog}% · ${a.defects} ღია ხარვეზი`,
    onMouseEnter: () => setHover(a.no),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(a.no),
    onBlur: () => setHover(null),
    onClick: () => activate(a),
  })

  const meta =
    project.id === 'NTB'
      ? ['ალექსანდრე ბანძელაძის ქუჩა', '21 საცხოვრებელი სართული', '−1 პარკინგი', `${apts.length} ბინა`]
      : [project.addr, `${floors.length} სართული`, `${apts.length} ბინა`]

  const shared: CellShared = { mode, visible, filtering, pinned, cellProps, hasParking, isDesktop }

  return (
    <div>
      <PageHeader crumb={`${project.id} / რუკა`} title="პროექტის რუკა" subtitle={meta.join(' · ')} />

      {/* Building totals. Each tile but the first is also the filter for its own
          metric. Two columns on a phone so they cost one screen-third, not two. */}
      <div className="mb-3 grid grid-cols-2 gap-2 nav:mb-3.5 nav:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
        <div className="flex items-baseline justify-between gap-2 rounded-xl border border-line bg-card px-3 py-1.5 nav:block nav:px-3.5 nav:py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-mut-2">საშუალო</div>
          <div className="text-base font-extrabold tabular-nums nav:mt-0.5 nav:text-lg">
            {stats.avg}%
          </div>
        </div>
        {(
          [
            ['done', 'დასრულებული', stats.done],
            ['def', 'ღია ხარვეზი', stats.defects],
            ['late', 'ჩამორჩენილი', stats.late],
          ] as [FilterKey, string, number][]
        ).map(([key, label, value]) => (
          <button
            key={key}
            onClick={() => setSearch({ filter: filter === key ? undefined : key })}
            className={cn(
              'flex cursor-pointer items-baseline justify-between gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors nav:block nav:px-3.5 nav:py-2.5',
              filter === key
                ? 'border-brand bg-brand-soft'
                : 'border-line bg-card hover:border-line-2 hover:bg-soft',
            )}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-mut-2">{label}</div>
            <div
              className={cn(
                'text-base font-extrabold tabular-nums nav:mt-0.5 nav:text-lg',
                key === 'def' && value > 0 && 'text-tone-open-fg',
              )}
            >
              {value}
            </div>
          </button>
        ))}
      </div>

      {/* Toolbar. Order flips at `nav:` so a phone gets two compact rows —
          mode + search, then a chip rail that scrolls instead of wrapping. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 nav:mb-3.5">
        <div className="order-1 flex flex-1 rounded-lg border border-line-2 bg-card p-0.5 nav:flex-none">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setSearch({ mode: m.id })}
              className={cn(
                'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors nav:flex-none',
                mode === m.id ? 'bg-chip-a text-chip-a-fg' : 'text-mut-3 hover:text-ink',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <span className="order-3 mx-1 hidden h-5 w-px bg-line nav:order-2 nav:block" />

        <div className="order-4 -mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-0.5 nav:order-3 nav:mx-0 nav:w-auto nav:flex-wrap nav:overflow-visible nav:px-0 nav:pb-0">
          <Chip className="shrink-0" active={!filter} onClick={() => setSearch({ filter: undefined })}>
            ყველა
          </Chip>
          {FILTER_KEYS.map((k) => (
            <Chip
              key={k}
              className="shrink-0"
              active={filter === k}
              onClick={() => setSearch({ filter: filter === k ? undefined : k })}
            >
              {FILTER_LABEL[k]}
            </Chip>
          ))}
        </div>

        <div className="relative order-2 ml-auto nav:order-4">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mut-2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ბინის ნომერი…"
            aria-label="ბინის ძებნა"
            className="h-8 w-32 pl-8 text-xs nav:w-40"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="ძებნის გასუფთავება"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-mut-2 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {filtering && (
          <span className="order-5 text-xs text-mut-2 tabular-nums">
            ნაპოვნია: {matchCount} / {apts.length}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 nav:flex-row">
        <div className="min-w-0 flex-1" ref={gridRef} onKeyDown={onGridKeyDown}>
          {drilled ? (
            <FloorView
              {...shared}
              floor={floorSel}
              units={current}
              floors={floors}
              onFloor={(f) => setSearch({ floor: f })}
              onBack={() => setSearch({ floor: undefined })}
            />
          ) : (
            <Elevation
              {...shared}
              floors={floors}
              byFloor={byFloor}
              maxUnits={maxUnits}
              onFloor={(f) => setSearch({ floor: f })}
            />
          )}

          <Legend mode={mode} />
        </div>

        {isDesktop ? (
          <Card className="h-fit w-75 shrink-0 self-start nav:sticky nav:top-4">
            {shown ? (
              <AptDetails
                apt={shown}
                pinned={pinned === shown.no}
                project={project.name}
                defects={openByApt.get(shown.no) ?? []}
                onOpen={openApt}
                onClear={() => setPinned(null)}
                onDefect={setDefect}
              />
            ) : (
              <CardContent className="p-5 text-center">
                <MousePointerClick className="mx-auto mb-2 h-7 w-7 stroke-[1.6] text-mut-2" />
                <div className="text-sm font-bold">აირჩიეთ ბინა</div>
                <p className="mt-1.5 text-xs leading-relaxed text-mut-2">
                  გადაატარეთ კურსორი უჯრაზე დეტალების სანახავად, დააკლიკეთ დასამაგრებლად და კიდევ
                  ერთხელ — ბინის გვერდის გასახსნელად.
                </p>
                <p className="mt-2.5 text-[11px] text-mut-2">
                  ისრებით გადაადგილება ·{' '}
                  <kbd className="rounded border border-line-2 px-1">Esc</kbd> გასუფთავება
                </p>
              </CardContent>
            )}
          </Card>
        ) : (
          shown && (
            <>
              <div
                className="fixed inset-0 z-130 bg-[rgba(14,18,22,0.5)]"
                onClick={() => setPinned(null)}
              />
              <div className="fixed inset-x-0 bottom-0 z-140 max-h-[78vh] animate-sheet-up overflow-y-auto rounded-t-2xl bg-card pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                <div className="mx-auto mb-1 mt-2 h-1 w-10 rounded-full bg-line-2" />
                <AptDetails
                  apt={shown}
                  pinned
                  project={project.name}
                  defects={openByApt.get(shown.no) ?? []}
                  onOpen={openApt}
                  onClear={() => setPinned(null)}
                  onDefect={setDefect}
                />
              </div>
            </>
          )
        )}
      </div>

      <DefectDialog defect={defect} onClose={() => setDefect(null)} />
    </div>
  )
}

// ---------------------------------------------------------------- elevation

/** Everything a cell needs to become interactive, wired once in `MapPage`. */
interface CellHandlers {
  'data-apt': string
  'aria-label': string
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
  onClick: () => void
}

interface CellShared {
  mode: ColorMode
  visible: (a: Apartment) => boolean
  filtering: boolean
  pinned: string | null
  cellProps: (a: Apartment) => CellHandlers
  hasParking: boolean
  isDesktop: boolean
}

/** A floor's units as one gapless heat strip — the phone row's whole visual. */
function FloorStrip({ units, mode }: { units: Apartment[]; mode: ColorMode }) {
  return (
    <span
      aria-hidden
      className="flex h-6 min-w-0 flex-1 gap-px overflow-hidden rounded border border-line bg-soft-2"
    >
      {units.map((a) => {
        const fill = cellFill(a, mode, 'sm')
        return (
          <span
            key={a.no}
            className="relative flex flex-1 items-center justify-center bg-soft-2 @container"
          >
            <span className={cn('absolute inset-x-0 bottom-0', fill.className)} style={fill.style} />
            {/* Same thresholds as a desktop cell, and the same reason: a phone
                gives each unit ~14px and gets none, a tablet ~36px and gets the
                number. The strip stays a heat overview either way. */}
            <span className="relative hidden font-mono text-[9px] font-semibold leading-none tabular-nums text-mut-3 @min-[20px]:block">
              <span className="hidden @min-[32px]:inline">{a.no.slice(0, -2)}</span>
              {a.no.slice(-2)}
            </span>
          </span>
        )
      })}
    </span>
  )
}

/**
 * The whole building at once. On desktop every unit is its own cell, columns
 * aligned so a vertical stripe is the same stack position on every floor. On a
 * phone the same data becomes one strip per floor and the row itself is the
 * target, because a single cell there is about 16px wide.
 */
function Elevation({
  floors,
  byFloor,
  maxUnits,
  onFloor,
  ...s
}: CellShared & {
  floors: number[]
  byFloor: Map<number, Apartment[]>
  maxUnits: number
  onFloor: (f: number) => void
}) {
  const rows = floors.map((f) => {
    const units = byFloor.get(f)!
    return {
      f,
      units,
      avg: Math.round(units.reduce((t, a) => t + a.prog, 0) / units.length),
      open: units.reduce((t, a) => t + a.defects, 0),
      hits: s.filtering ? units.filter(s.visible).length : units.length,
    }
  })

  if (!s.isDesktop) {
    return (
      <Card>
        <CardContent className="p-2 pt-2">
          {rows.map((r) => (
            <button
              key={r.f}
              onClick={() => onFloor(r.f)}
              aria-label={`სართული ${r.f} — ${r.units.length} ბინა, საშუალო ${r.avg}%, ${r.open} ღია ხარვეზი`}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 text-left active:bg-soft',
                s.filtering && r.hits === 0 && 'opacity-40',
              )}
            >
              <span className="w-6 shrink-0 font-mono text-xs font-bold tabular-nums">
                {String(r.f).padStart(2, '0')}
              </span>
              <FloorStrip units={r.units} mode={s.mode} />
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-mut-2">
                {r.avg}%
              </span>
              <span className="w-6 shrink-0 text-right">
                {r.open > 0 && (
                  <span className="inline-block min-w-5 rounded-full bg-tone-open-solid px-1 text-center text-[10px] font-bold text-white tabular-nums">
                    {r.open}
                  </span>
                )}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-mut-2" />
            </button>
          ))}

          {s.hasParking && (
            <button
              onClick={() => onFloor(PARKING)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left active:bg-soft"
            >
              <span className="w-6 shrink-0 font-mono text-xs font-bold">P</span>
              <span className="flex h-6 flex-1 items-center rounded border border-line bg-soft-2 px-2 text-[10px] text-mut">
                პარკინგი — 96 ადგილი
              </span>
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-mut-2">100%</span>
              <span className="w-6 shrink-0" />
              <ChevronRight className="h-4 w-4 shrink-0 text-mut-2" />
            </button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto p-3 pt-3">
        <div className="min-w-120">
          <div className="mb-1 flex items-center gap-2 pr-1 text-[10px] font-bold uppercase tracking-wide text-mut-2">
            <span className="w-13 shrink-0 px-1.5">სართ.</span>
            <span className="min-w-0 flex-1">ბინები</span>
            <span className="w-16 shrink-0 text-right">საშ. · ხარვ.</span>
          </div>
          <div className="space-y-0.5">
            {rows.map((r) => (
              <div
                key={r.f}
                className={cn(
                  'group flex items-center gap-2 rounded-lg py-0.5 pr-1 transition-colors hover:bg-soft',
                  s.filtering && r.hits === 0 && 'opacity-40',
                )}
              >
                <button
                  onClick={() => onFloor(r.f)}
                  aria-label={`სართული ${r.f} — გახსნა`}
                  className="flex w-13 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-soft-2"
                >
                  <span className="w-5 font-mono text-[11px] font-bold tabular-nums">
                    {String(r.f).padStart(2, '0')}
                  </span>
                  <ChevronRight className="h-3 w-3 text-mut-2 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>

                <div
                  data-cells
                  className="grid min-w-0 flex-1 gap-0.75"
                  style={{ gridTemplateColumns: `repeat(${maxUnits}, minmax(0, 1fr))` }}
                >
                  {r.units.map((a) => (
                    <Cell key={a.no} apt={a} size="sm" {...s} />
                  ))}
                </div>

                <div className="w-16 shrink-0 text-right text-[10px] tabular-nums text-mut-2">
                  {r.avg}%
                  {r.open > 0 && <span className="ml-1 font-bold text-tone-open-fg">{r.open}</span>}
                </div>
              </div>
            ))}

            {s.hasParking && (
              <button
                onClick={() => onFloor(PARKING)}
                className="group flex w-full cursor-pointer items-center gap-2 rounded-lg py-0.5 pr-1 text-left transition-colors hover:bg-soft"
              >
                <span className="flex w-13 shrink-0 items-center gap-1 px-1.5 py-1">
                  <span className="w-5 font-mono text-[11px] font-bold">P</span>
                  <ChevronRight className="h-3 w-3 text-mut-2 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="flex h-6 flex-1 items-center rounded-[3px] border border-line bg-soft-2 px-2 text-[10px] text-mut">
                  პარკინგი — 96 ადგილი
                </span>
                <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-mut-2">
                  100%
                </span>
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------- floor view

function FloorView({
  floor,
  units,
  floors,
  onFloor,
  onBack,
  ...s
}: CellShared & {
  floor: number
  units: Apartment[]
  floors: number[]
  onFloor: (f: number) => void
  onBack: () => void
}) {
  const isPark = floor === PARKING
  const avg = units.length ? Math.round(units.reduce((t, a) => t + a.prog, 0) / units.length) : 0
  const open = units.reduce((t, a) => t + a.defects, 0)

  // `floors` runs top-down; the parking deck sits below the lowest floor.
  const steps = s.hasParking ? [...floors, PARKING] : floors
  const i = steps.indexOf(floor)
  const up = steps[i - 1]
  const down = steps[i + 1]

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ChevronLeft className="h-3.5 w-3.5" /> შენობა
        </Button>
        <div className="text-base font-extrabold">
          {isPark ? 'პარკინგი (−1)' : `სართული ${floor}`}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="ზემოთ"
            disabled={up === undefined}
            onClick={() => up !== undefined && onFloor(up)}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4 rotate-90" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="ქვემოთ"
            disabled={down === undefined}
            onClick={() => down !== undefined && onFloor(down)}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4 rotate-90" />
          </Button>
        </div>
        {!isPark && (
          <div className="w-full text-xs text-mut nav:w-auto">
            {units.length} ბინა · საშუალო {avg}%
            {open > 0 && <span className="font-bold text-tone-open-fg"> · {open} ღია ხარვეზი</span>}
          </div>
        )}
      </div>

      {isPark ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-mut">
            პარკინგის დონე — 96 ადგილი · მოპირკეთება დასრულებული · ხარვეზები არ არის
          </CardContent>
        </Card>
      ) : (
        <div
          data-cells
          className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] nav:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]"
        >
          {units.map((a) => (
            <Cell key={a.no} apt={a} size="lg" {...s} />
          ))}
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------- cell

function Cell({
  apt,
  size,
  mode,
  visible,
  filtering,
  pinned,
  cellProps,
}: Omit<CellShared, 'hasParking' | 'isDesktop'> & { apt: Apartment; size: 'sm' | 'lg' }) {
  const fill = cellFill(apt, mode, size)
  const dim = filtering && !visible(apt)
  const on = pinned === apt.no

  return (
    <button
      {...cellProps(apt)}
      className={cn(
        'relative cursor-pointer overflow-hidden border bg-soft-2 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring',
        size === 'sm'
          ? // `@container`: how much of the number fits is a property of this
            // cell, not the viewport. A floor of 18 units gives each one ~26px
            // at the nav breakpoint and ~90px on a wide monitor, and the same
            // screen shows narrower cells on the fuller floors.
            'flex h-6 items-center justify-center rounded-[3px] @container'
          : 'flex h-20 flex-col justify-end rounded-lg bg-card p-2',
        on ? 'border-brand ring-2 ring-brand-ring' : 'border-line hover:border-brand/60',
        dim && 'opacity-25',
      )}
    >
      <span
        className={cn('absolute inset-x-0 bottom-0 transition-[height]', fill.className)}
        style={fill.style}
      />

      {size === 'lg' ? (
        <>
          <span className="relative flex items-start justify-between">
            <span>
              <span className="block text-[13px] font-extrabold leading-tight">{apt.no}</span>
              <span className="block text-[10px] text-mut-3">
                {apt.area} მ² · {apt.rooms} ოთ.
              </span>
            </span>
            {apt.defects > 0 && (
              <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-tone-open-solid text-[9px] font-bold text-white">
                {apt.defects}
              </span>
            )}
          </span>
          <span className="relative mt-2 text-[10px] font-semibold tabular-nums text-mut-3">
            {apt.prog}%
          </span>
        </>
      ) : (
        <>
          {/* The unit index always, the floor prefix only once there is room
              for it — the row is already labelled with its floor, so `04` is
              never ambiguous, and `1204` is what people actually search for. */}
          {/* Thresholds are content-box widths, so they sit ~2px under the
              cell width the grid hands out. `1204` measures ~22px at 9px in
              this mono face; 32 leaves it room to breathe. */}
          <span className="relative hidden font-mono text-[9px] font-semibold leading-none tabular-nums text-mut-3 @min-[20px]:block">
            <span className="hidden @min-[32px]:inline">{apt.no.slice(0, -2)}</span>
            {apt.no.slice(-2)}
          </span>

          {/* At elevation scale only the exception gets a marker — everything
              else is carried by the fill itself. */}
          {apt.defects > 0 && mode !== 'defects' && (
            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-tone-open-solid" />
          )}
        </>
      )}
    </button>
  )
}

// ------------------------------------------------------------ unit details

function AptDetails({
  apt,
  pinned,
  project,
  defects,
  onOpen,
  onClear,
  onDefect,
}: {
  apt: Apartment
  pinned: boolean
  project: string
  defects: Defect[]
  onOpen: (no: string) => void
  onClear: () => void
  onDefect: (d: Defect) => void
}) {
  return (
    <CardContent className="space-y-3.5 p-4 pt-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-extrabold leading-tight">ბინა {apt.no}</div>
          <div className="text-[11px] text-mut-2">
            სართული {apt.floor} · {project}
          </div>
        </div>
        {pinned && (
          <button
            onClick={onClear}
            aria-label="დახურვა"
            className="cursor-pointer rounded-md p-1 text-mut-2 hover:bg-soft hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <StatusBadge status={apt.prog >= 100 ? 'Completed' : apt.late ? 'Delayed' : 'In Progress'} />

      <div>
        <div className="mb-1 flex items-baseline justify-between text-[11px]">
          <span className="font-bold uppercase tracking-wide text-mut-2">პროგრესი</span>
          <span className="text-sm font-extrabold tabular-nums">{apt.prog}%</span>
        </div>
        <Progress
          value={apt.prog}
          barColor={
            apt.prog >= 100
              ? 'var(--color-tone-ok-solid)'
              : apt.late
                ? 'var(--color-tone-warn-solid)'
                : 'var(--color-brand)'
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-line-soft pt-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mut-2">ფართობი</div>
          <div className="font-bold">{apt.area} მ²</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mut-2">ოთახები</div>
          <div className="font-bold">{apt.rooms} + სამზარეულო</div>
        </div>
      </div>

      <div className="border-t border-line-soft pt-3">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-mut-2">
          ღია ხარვეზები ({defects.length})
        </div>
        {defects.length === 0 ? (
          <p className="text-xs text-tone-ok-fg">ხარვეზები არ ფიქსირდება</p>
        ) : (
          <div className="space-y-1">
            {defects.map((d) => (
              <button
                key={d.id}
                onClick={() => onDefect(d)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-soft"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-bold" title={d.cat}>
                    {d.group ?? d.cat}
                  </span>
                  <span className="block truncate text-[10px] text-mut-2">
                    {d.room} · {d.id}
                  </span>
                </span>
                <StatusBadge status={d.st} className="shrink-0 px-1.5 text-[10px]" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Button className="w-full" onClick={() => onOpen(apt.no)}>
        ბინის გვერდი <CornerDownLeft className="h-3.5 w-3.5" />
      </Button>
    </CardContent>
  )
}

// -------------------------------------------------------------------- legend

function Swatch({
  style,
  className,
  label,
}: {
  style?: React.CSSProperties
  className?: string
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-sm border border-line', className)} style={style} />
      {label}
    </span>
  )
}

function Legend({ mode }: { mode: ColorMode }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-mut">
      {mode === 'prog' ? (
        <>
          {(['prog', 'done', 'late'] as const).map((s) => (
            <Swatch key={s} label={STATE_LABEL[s]} className={SWATCH_CLASS[s]} />
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-tone-open-solid" /> ღია ხარვეზი
          </span>
        </>
      ) : (
        [0, 1, 2, 3].map((n) => (
          <Swatch
            key={n}
            label={n === 0 ? 'ხარვეზის გარეშე' : n === 3 ? '3+ ხარვეზი' : `${n} ხარვეზი`}
            className={n === 0 ? 'bg-soft-2' : undefined}
            style={{ background: heatMix(n) }}
          />
        ))
      )}
    </div>
  )
}
