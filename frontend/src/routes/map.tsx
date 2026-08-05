import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { apartmentsQuery } from '@/api/queries'
import { useSession } from '@/lib/session'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Apartment } from '@/data/domain'

export const Route = createFileRoute('/map')({
  component: MapPage,
})

function MapPage() {
  const { project } = useSession()
  const navigate = useNavigate()
  const { data: apts } = useSuspenseQuery(apartmentsQuery(project.id))
  const [floorSel, setFloorSel] = useState<number | 'P'>(14)
  const [hover, setHover] = useState<Apartment | null>(null)

  const byFloor = useMemo(() => {
    const m = new Map<number, Apartment[]>()
    apts.forEach((a) => {
      const arr = m.get(a.floor) ?? []
      arr.push(a)
      m.set(a.floor, arr)
    })
    return m
  }, [apts])

  const floors = [...byFloor.keys()].sort((a, b) => b - a)
  const isPark = floorSel === 'P'
  const current = isPark ? [] : (byFloor.get(floorSel as number) ?? [])
  const avgF = current.length
    ? Math.round(current.reduce((s, a) => s + a.prog, 0) / current.length)
    : 0

  const meta =
    project.id === 'NTB'
      ? ['ალექსანდრე ბანძელაძის ქუჩა', '21 საცხოვრებელი სართული', '−1 პარკინგი', '358 ბინა']
      : [project.addr, `${floors.length} სართული`, `${apts.length} ბინა`]

  return (
    <div>
      <PageHeader title="პროექტის რუკა" subtitle={meta.join(' · ')} />

      <div className="flex gap-4">
        {/* Floor strip */}
        <Card className="w-40 shrink-0">
          <CardContent className="max-h-[calc(100vh-11rem)] space-y-0.5 overflow-y-auto p-2">
            {floors.map((f) => {
              const fl = byFloor.get(f)!
              const avg = Math.round(fl.reduce((s, a) => s + a.prog, 0) / fl.length)
              const complete = fl.every((a) => a.prog >= 100)
              const hasDef = fl.some((a) => a.defects > 0)
              const on = floorSel === f
              return (
                <button
                  key={f}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border-l-2 border-transparent px-2 py-1.5 text-left cursor-pointer hover:bg-soft',
                    on && 'border-brand bg-soft-2',
                  )}
                  onClick={() => setFloorSel(f)}
                >
                  <span className={cn('w-7 text-xs', on ? 'font-extrabold' : 'font-semibold')}>
                    {String(f).padStart(2, '0')}
                  </span>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-soft-2">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${avg}%`, backgroundColor: complete ? '#0E7D52' : '#FF4D00' }}
                    />
                  </span>
                  {hasDef && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
                </button>
              )
            })}
            {project.id === 'NTB' && (
              <button
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border-l-2 border-transparent px-2 py-1.5 text-left cursor-pointer hover:bg-soft',
                  isPark && 'border-brand bg-soft-2',
                )}
                onClick={() => setFloorSel('P')}
              >
                <span className={cn('w-7 text-xs', isPark ? 'font-extrabold' : 'font-semibold')}>P</span>
                <span className="text-[11px] text-mut">პარკინგი</span>
              </button>
            )}
          </CardContent>
        </Card>

        {/* Apartment grid */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-baseline gap-3">
            <div className="text-base font-extrabold">
              სართული {isPark ? '−1 (პარკინგი)' : floorSel}
            </div>
            {!isPark && (
              <div className="text-xs text-mut">
                {current.length} ბინა · საშუალო {avgF}%
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
              {current.map((a) => (
                <button
                  key={a.no}
                  className={cn(
                    'relative flex h-20 flex-col justify-end overflow-hidden rounded-lg border bg-card p-1.5 text-left transition-shadow cursor-pointer hover:shadow-md',
                    a.prog >= 100 ? 'border-ok/50' : 'border-line',
                  )}
                  onClick={() => navigate({ to: '/apartments/$aptNo', params: { aptNo: a.no } })}
                  onMouseEnter={() => setHover(a)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    className="absolute inset-x-0 bottom-0"
                    style={{
                      height: `${a.prog}%`,
                      background:
                        a.prog >= 100
                          ? 'linear-gradient(180deg,#B9E0C9,#A0D4B4)'
                          : a.late
                            ? 'linear-gradient(180deg,#F3E6C2,#EAD79E)'
                            : 'linear-gradient(180deg,#DCEBE2,#C2DFCE)',
                    }}
                  />
                  <div className="relative flex items-end justify-between">
                    <div>
                      <div className="text-xs font-extrabold">{a.no}</div>
                      <div className="text-[10px] text-mut-3">{a.prog}%</div>
                    </div>
                    {a.defects > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
                        {a.defects}
                      </span>
                    )}
                  </div>
                  {a.sold && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-info" />}
                </button>
              ))}
            </div>
          )}

          {/* Hover details */}
          <div className="mt-3 h-10 text-xs text-mut">
            {hover && (
              <>
                <b className="text-ink">ბინა {hover.no}</b> · {hover.prog}% · {hover.area} მ² · {hover.rooms} ოთახი ·{' '}
                {hover.sold ? 'გაყიდული — მფლობელი მიბმულია' : 'თავისუფალი'} ·{' '}
                <span className={hover.defects > 0 ? 'font-bold text-danger-2' : 'text-ok'}>
                  {hover.defects > 0 ? `${hover.defects} ღია ხარვეზი` : 'ხარვეზები არ არის'}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-[11px] text-mut">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#C2DFCE]" /> მიმდინარე
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#A0D4B4]" /> დასრულებული
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#EAD79E]" /> ჩამორჩენა
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-info" /> გაყიდული
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[8px] font-bold text-white">n</span>
              ღია ხარვეზი
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
