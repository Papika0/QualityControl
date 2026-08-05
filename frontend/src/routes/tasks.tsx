import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { tasksQuery } from '@/api/queries'
import { useSetTaskColumn } from '@/api/mutations'
import { TASK_TYPES, type TaskColumn } from '@/data/domain'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TaskDialog } from '@/components/task-dialog'
import { hash01 } from '@/lib/utils'

// Typed search params: assignee / floor / task-type filters are URL state.
interface TasksSearch {
  who?: string
  floor?: number
  type?: string
}

export const Route = createFileRoute('/tasks')({
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    who: typeof search.who === 'string' ? search.who : undefined,
    floor: typeof search.floor === 'number' ? search.floor : undefined,
    type: typeof search.type === 'string' ? search.type : undefined,
  }),
  component: TasksPage,
})

const COLUMNS: { key: TaskColumn; label: string; dot: string }[] = [
  { key: 'new', label: 'ახალი', dot: '#C2410C' },
  { key: 'prog', label: 'მიმდინარე', dot: '#2447C6' },
  { key: 'check', label: 'შემოწმებაზე', dot: '#92670A' },
  { key: 'done', label: 'დასრულებული', dot: '#0E7D52' },
]

const PRI_DOT = { high: '#C0361F', med: '#92670A', low: '#8A949B' } as const

const ALL = 'ყველა'

function TasksPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: tasks } = useSuspenseQuery(tasksQuery())
  const advance = useSetTaskColumn()
  // Track the id, not the row: the column change is persisted and refetched,
  // so the open dialog must read from the fresh list.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = tasks.find((t) => t.id === selectedId) ?? null

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!search.who || t.who === search.who) &&
          (search.floor === undefined || t.floor === search.floor) &&
          (!search.type || t.type === search.type),
      ),
    [tasks, search],
  )

  const people = [...new Set(tasks.map((t) => t.who))]
  const floors = [...new Set(tasks.map((t) => t.floor))].sort((a, b) => a - b)
  const hasFilter = !!(search.who || search.floor !== undefined || search.type)

  return (
    <div>
      <PageHeader
        title="დავალებები"
        subtitle={`${filtered.length} დავალება`}
        actions={
          <Button>
            <Plus className="h-4 w-4" /> ახალი დავალება
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={search.who ?? ALL}
          onValueChange={(v) => navigate({ search: (p) => ({ ...p, who: v === ALL ? undefined : v }), replace: true })}
        >
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>შემსრულებელი: ყველა</SelectItem>
            {people.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.floor === undefined ? ALL : String(search.floor)}
          onValueChange={(v) =>
            navigate({ search: (p) => ({ ...p, floor: v === ALL ? undefined : Number(v) }), replace: true })
          }
        >
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>სართული: ყველა</SelectItem>
            {floors.map((f) => (
              <SelectItem key={f} value={String(f)}>სართული {f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.type ?? ALL}
          onValueChange={(v) => navigate({ search: (p) => ({ ...p, type: v === ALL ? undefined : v }), replace: true })}
        >
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ტიპი: ყველა</SelectItem>
            {TASK_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={() => navigate({ search: {}, replace: true })}>
            <X className="h-3.5 w-3.5" /> გასუფთავება
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const cards = filtered.filter((t) => t.col === col.key)
          return (
            <div key={col.key} className="rounded-xl bg-soft p-2.5">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.dot }} />
                <span className="text-xs font-bold">{col.label}</span>
                <span className="rounded-full bg-soft-2 px-1.5 text-[10px] font-bold text-mut-3">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.map((t) => {
                  const total = 3 + Math.floor(hash01(t.id) * 3)
                  const done =
                    col.key === 'done' ? total : col.key === 'check' ? total - 1 : col.key === 'prog' ? Math.ceil(total / 2) : 0
                  const late = t.due.includes('ივლ') && col.key !== 'done'
                  return (
                    <Card
                      key={t.id}
                      className="cursor-pointer p-3 hover:shadow-md"
                      onClick={() => setSelectedId(t.id)}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-mut-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PRI_DOT[t.pri] }} />
                        {t.id}
                      </div>
                      <div className="mt-1 text-[13px] font-semibold leading-snug">{t.title}</div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-mut">
                        <span>{t.loc} · {t.who}</span>
                        <span className={late ? 'font-bold text-danger' : ''}>{t.due}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-soft-2">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${Math.round((done / total) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-mut-2">{done}/{total}</span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {selected && (
        <TaskDialog
          task={selected}
          onClose={() => setSelectedId(null)}
          onAdvance={(id, col) => advance.mutate({ id, col })}
          advancing={advance.isPending}
        />
      )}
    </div>
  )
}
