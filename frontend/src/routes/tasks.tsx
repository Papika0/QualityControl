import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { tasksQuery } from '@/api/queries'
import {
  PRI_DOT,
  STATUS_TONE,
  TASK_COL_LABEL,
  TASK_FLOW,
  checklistProgress,
  taskLocation,
  toneSolid,
  type Task,
  type TaskTrack,
} from '@/data/domain'
import { useSession, useTaskActor } from '@/lib/session'
import { canCreateTask, canSeeRequests, visibleTasks } from '@/lib/task-perms'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Progress } from '@/components/ui/progress'
import { TaskDialog } from '@/components/task-dialog'
import { NewTaskDialog } from '@/components/new-task-dialog'

// Typed search params: assignee / floor / track filters are URL state.
interface TasksSearch {
  who?: string
  floor?: number
  track?: TaskTrack
  mine?: boolean
  /** Deep link from the dashboard — opens that ticket on arrival. */
  id?: string
}

export const Route = createFileRoute('/tasks')({
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    who: typeof search.who === 'string' ? search.who : undefined,
    floor: typeof search.floor === 'number' ? search.floor : undefined,
    track: search.track === 'main' || search.track === 'tech' ? search.track : undefined,
    mine: search.mine === true ? true : undefined,
    id: typeof search.id === 'string' ? search.id : undefined,
  }),
  component: TasksPage,
})

function TasksPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { project } = useSession()
  const actor = useTaskActor()
  const { data: all } = useSuspenseQuery(tasksQuery(project.id))
  // Track the id, not the row: every write refetches the list, so the open
  // dialog has to read from the fresh one.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  /** Set while splitting work out of an open ticket. */
  const [splitting, setSplitting] = useState<Task | null>(null)

  // Visibility first, and outside the filter chain: a supervisor not seeing
  // somebody else's work is not a filter they can clear.
  const tasks = useMemo(() => visibleTasks(actor, all), [actor, all])

  const selected = tasks.find((t) => t.id === selectedId) ?? null
  const subtasks = useMemo(
    () => (selected ? tasks.filter((t) => t.parentId === selected.id) : []),
    [tasks, selected],
  )

  // A supervisor gets a clean four-column board, but a column is never dropped
  // while it still holds something this actor can see — otherwise a card that
  // slips into a hidden column (an admin-filed technical request, say) would
  // vanish from the board with no trace.
  const columns = useMemo(
    () =>
      TASK_FLOW.filter(
        (c) => c !== 'req' || canSeeRequests(actor) || tasks.some((t) => t.col === 'req'),
      ),
    [actor, tasks],
  )

  const setFilter = (patch: Partial<TasksSearch>) =>
    navigate({ search: (p) => ({ ...p, ...patch }), replace: true })

  // `?id=` opens the ticket, then strips itself so a reload or a back-step does
  // not reopen it.
  useEffect(() => {
    if (!search.id) return
    setSelectedId(search.id)
    void navigate({ search: (p) => ({ ...p, id: undefined }), replace: true })
  }, [search.id, navigate])

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!search.who || t.who === search.who) &&
          (search.floor === undefined || t.floors.includes(search.floor)) &&
          (!search.track || t.track === search.track) &&
          (!search.mine || t.whoId === actor.personId),
      ),
    [tasks, search, actor.personId],
  )

  const people = [...new Set(tasks.map((t) => t.who).filter(Boolean))]
  const floors = [...new Set(tasks.flatMap((t) => t.floors))].sort((a, b) => a - b)
  const tracks = [...new Set(tasks.map((t) => t.track))]
  const hasFilter = !!(search.who || search.floor !== undefined || search.track || search.mine)
  // A site supervisor is only ever shown their own work, so "ჩემი" would filter
  // nothing. It earns its place only for a technical supervisor, who also sees
  // the whole main flow.
  const showMine = !!actor.personId && tasks.some((t) => t.whoId !== actor.personId)

  return (
    <div>
      <PageHeader
        title="დავალებები"
        subtitle={`${filtered.length} დავალება · ${project.name}`}
        actions={
          canCreateTask(actor) && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> ახალი დავალება
            </Button>
          )
        }
      />

      {/* Below `sm` the chips ride one edge-to-edge scroll strip; `sm:contents`
          dissolves it above so they wrap normally. */}
      <div className="mb-3.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.75">
        <div className="no-scrollbar -mx-[clamp(14px,2.6vw,26px)] flex gap-1.75 overflow-x-auto px-[clamp(14px,2.6vw,26px)] sm:contents">
          <Chip active={!hasFilter} onClick={() => navigate({ search: {}, replace: true })}>
            ყველა
          </Chip>
          {showMine && (
            <Chip active={!!search.mine} onClick={() => setFilter({ mine: search.mine ? undefined : true })}>
              ჩემი
            </Chip>
          )}
          {tracks.length > 1 &&
            (['main', 'tech'] as TaskTrack[]).map((t) => (
              <Chip
                key={t}
                active={search.track === t}
                onClick={() => setFilter({ track: search.track === t ? undefined : t })}
              >
                {t === 'main' ? 'ძირითადი' : 'ტექნიკური'}
              </Chip>
            ))}
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          <select
            value={search.who ?? ''}
            onChange={(e) => setFilter({ who: e.target.value || undefined })}
            aria-label="შემსრულებელი"
            className="min-w-0 cursor-pointer rounded-full border border-line-2 bg-card px-3 py-1.5 text-xs font-semibold text-mut-3"
          >
            <option value="">შემსრულებელი: ყველა</option>
            {people.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={search.floor === undefined ? '' : String(search.floor)}
            onChange={(e) => setFilter({ floor: e.target.value ? Number(e.target.value) : undefined })}
            aria-label="სართული"
            className="min-w-0 cursor-pointer rounded-full border border-line-2 bg-card px-3 py-1.5 text-xs font-semibold text-mut-3"
          >
            <option value="">სართული: ყველა</option>
            {floors.map((f) => (
              <option key={f} value={f}>სართული {f}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-line-2 px-4 py-10 text-center">
          <div className="text-sm font-semibold text-mut-3">
            {hasFilter ? 'ფილტრს დავალება არ შეესაბამება' : 'დავალება ჯერ არ არის'}
          </div>
          <div className="mt-1 text-xs text-mut-2">
            {hasFilter
              ? 'შეცვალეთ ან გაასუფთავეთ ფილტრი.'
              : 'როგორც კი დაგენიშნებათ დავალება, აქ გამოჩნდება.'}
          </div>
          {hasFilter && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate({ search: {}, replace: true })}>
              ფილტრის გასუფთავება
            </Button>
          )}
        </div>
      )}

      {/* The five stages are one pipeline, so they stay on one line and scroll.
          A wrapping grid put `დასრულებული` directly under `უფროსის მოთხოვნა`
          at tablet widths, which reads as a second, unrelated board. Columns
          snap on a phone and only stop scrolling once all five fit at `xl`. */}
      <div
        className={cn(
          'no-scrollbar -mx-[clamp(14px,2.6vw,26px)] flex snap-x gap-3 overflow-x-auto px-[clamp(14px,2.6vw,26px)] py-1 xl:mx-0 xl:px-0',
          filtered.length === 0 && 'hidden',
        )}
      >
        {columns.map((col) => {
          const cards = filtered.filter((t) => t.col === col)
          const dot = toneSolid(STATUS_TONE[TASK_COL_LABEL[col]] ?? 'neutral')
          return (
            <div
              key={col}
              className="w-[76vw] max-w-72 flex-none snap-start rounded-xl bg-soft p-2.5 sm:w-52 xl:w-auto xl:min-w-0 xl:max-w-none xl:flex-1"
            >
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: dot }} />
                <span className="min-w-0 truncate text-xs font-bold">{TASK_COL_LABEL[col]}</span>
                <span className="ml-auto flex-none rounded-full bg-soft-2 px-1.5 text-[10px] font-bold text-mut-3">
                  {cards.length}
                </span>
              </div>
              <div className="space-y-2">
                {cards.map((t) => (
                  <TaskCard key={t.id} task={t} onOpen={() => setSelectedId(t.id)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <TaskDialog
        task={selected}
        subtasks={subtasks}
        onClose={() => setSelectedId(null)}
        onSelect={setSelectedId}
        onAddSubtask={() => selected && setSplitting(selected)}
      />

      {creating && (
        <NewTaskDialog onClose={() => setCreating(false)} onCreated={(t) => setSelectedId(t.id)} />
      )}
      {splitting && <NewTaskDialog parent={splitting} onClose={() => setSplitting(null)} />}
    </div>
  )
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const total = task.checklist.length
  const done = task.checklist.filter((i) => i.done).length
  return (
    <Card className="cursor-pointer p-3 hover:shadow-md" onClick={onOpen}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-mut-2">
        <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: PRI_DOT[task.pri] }} />
        {task.id}
        {task.parentId && <span className="rounded bg-soft-2 px-1 py-px text-[9px]">ქვე</span>}
        {task.track === 'tech' && <span className="rounded bg-soft-2 px-1 py-px text-[9px]">ტექ</span>}
      </div>
      {/* Clamped, both of them: a title runs to a sentence and a location can
          list every apartment on three floors — unclamped, one card would push
          the rest of the column off the screen. */}
      <div className="mt-1 line-clamp-3 text-[13px] font-semibold leading-snug">{task.title}</div>
      <div className="mt-2 line-clamp-2 text-[11px] text-mut">
        {taskLocation(task)} · {task.who || 'დაუნიშნავი'}
      </div>
      {total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <Progress value={checklistProgress(task.checklist)} className="flex-1" />
          <span className="flex-none text-[10px] font-bold text-mut-2">{done}/{total}</span>
        </div>
      )}
      {task.gate.ready && (
        <div className="mt-1.5 text-[10px] font-bold text-ok">✓ მზადაა დასადასტურებლად</div>
      )}
    </Card>
  )
}
