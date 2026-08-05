import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import Gantt, { type GanttTask } from 'frappe-gantt'
import { PageHeader } from '@/components/page-header'
import { Chip } from '@/components/ui/chip'
import { useSession } from '@/lib/session'

export const Route = createFileRoute('/schedule')({
  component: SchedulePage,
})

// Master schedule of the main construction packages (from the approved baseline).
const PACKAGES: GanttTask[] = [
  { id: 'structural', name: 'Structural / კარკასი', start: '2026-03-01', end: '2026-05-10', progress: 100 },
  { id: 'block', name: 'Block + Plaster', start: '2026-03-25', end: '2026-06-15', progress: 100 },
  { id: 'mep', name: 'MEP Rough — ელ. + სანტექნიკა', start: '2026-05-01', end: '2026-07-25', progress: 88, dependencies: 'structural' },
  { id: 'wp', name: 'Waterproofing — სველი წერტილები', start: '2026-06-10', end: '2026-08-05', progress: 70, dependencies: 'block' },
  { id: 'tile', name: 'Tile / მოპირკეთება — კრიტიკული გზა', start: '2026-07-10', end: '2026-09-25', progress: 55, dependencies: 'wp' },
  { id: 'paint', name: 'Painting + Ceiling', start: '2026-08-15', end: '2026-10-25', progress: 35, dependencies: 'tile' },
  { id: 'doors', name: 'Doors + Kitchen — გაყიდულ ბინებში', start: '2026-09-25', end: '2026-11-15', progress: 0, dependencies: 'paint' },
  { id: 'handover', name: 'Handover — 358 ბინა', start: '2026-11-01', end: '2026-12-20', progress: 0, dependencies: 'doors' },
]

const VIEW_MODES = ['Day', 'Week', 'Month'] as const

function SchedulePage() {
  const { project } = useSession()
  const ref = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<Gantt | null>(null)
  const [mode, setMode] = useState<(typeof VIEW_MODES)[number]>('Month')

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    ganttRef.current = new Gantt(ref.current, PACKAGES, {
      view_mode: mode,
      readonly: true,
      infinite_padding: false,
      view_mode_select: false,
      today_button: false,
    })
    return () => {
      if (ref.current) ref.current.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    ganttRef.current?.change_view_mode(mode)
  }, [mode])

  return (
    <div>
      <PageHeader
        title="გეგმა-გრაფიკი"
        subtitle={`${project.name} · მთავარი პაკეტები · baseline v3`}
        actions={
          <div className="flex gap-1.5">
            {VIEW_MODES.map((m) => (
              <Chip key={m} active={mode === m} onClick={() => setMode(m)}>
                {m === 'Day' ? 'დღე' : m === 'Week' ? 'კვირა' : 'თვე'}
              </Chip>
            ))}
          </div>
        }
      />
      <div ref={ref} />
      <p className="mt-3 text-[11px] text-mut">
        ისრები აღნიშნავს დამოკიდებულებებს · ზოლის შევსება — ფაქტობრივი პროგრესი · კრიტიკული გზა: Waterproofing → Tile → Painting
      </p>
    </div>
  )
}
