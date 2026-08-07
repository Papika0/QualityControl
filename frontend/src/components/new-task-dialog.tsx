import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { apartmentsQuery } from '@/api/queries'
import { useCreateTask } from '@/api/mutations'
import {
  PRI_LABEL,
  QA_TEAM,
  TASK_COL_LABEL,
  type Priority,
  type Task,
  type TaskColumn,
  type TaskTrack,
} from '@/data/domain'
import { useSession, useTaskActor } from '@/lib/session'
import { allowedNewColumns, allowedTracks, ownsBreakdown } from '@/lib/task-perms'
import { useToast } from '@/lib/toast'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

const LABEL = 'mb-1.25 block text-[10px] font-semibold uppercase tracking-[0.1em] text-mut'
const CONTROL = 'w-full rounded-lg border border-line-2 bg-card px-2.75 py-2.25 text-[13px]'

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  )
}

const TRACK_LABEL: Record<TaskTrack, string> = { main: 'ძირითადი', tech: 'ტექნიკური' }

/**
 * Files a task, or breaks a sub-task out of one. What the form offers is
 * derived from the actor: a director who can only file requests never sees an
 * assignee picker, because a request is assigned later by the manager who
 * breaks it down.
 */
export function NewTaskDialog({
  onClose,
  onCreated,
  parent,
}: {
  onClose: () => void
  /** Handed the saved row so the board can open it. */
  onCreated?: (task: Task) => void
  /** Set when splitting work out of an existing task. */
  parent?: Task
}) {
  const { project } = useSession()
  const actor = useTaskActor()
  const toast = useToast()
  const { data: apts } = useQuery(apartmentsQuery(project.id))
  const create = useCreateTask()

  // A sub-task is always ready-to-work on the parent's own track; only a
  // top-level filing gets to choose.
  const cols = parent ? (['new'] as TaskColumn[]) : allowedNewColumns(actor)
  const tracks = parent ? [parent.track] : allowedTracks(actor)

  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [pri, setPri] = useState<Priority>(parent?.pri ?? 'med')
  const [col, setCol] = useState<TaskColumn>(cols[0] ?? 'new')
  const [track, setTrack] = useState<TaskTrack>(tracks[0] ?? 'main')
  const [floors, setFloors] = useState<number[]>(parent?.floors ?? [])
  const [aptNos, setAptNos] = useState<string[]>(parent?.apts ?? [])
  const [whoId, setWhoId] = useState<string>('')
  const [items, setItems] = useState<string[]>([''])

  const allFloors = useMemo(
    () => [...new Set((apts ?? []).map((a) => a.floor))].sort((a, b) => b - a),
    [apts],
  )
  // Apartments follow the floors: unpicking a floor drops its units, so the
  // location can never describe a unit on a floor the task does not cover.
  const aptsOnFloors = useMemo(
    () => (apts ?? []).filter((a) => floors.includes(a.floor)).map((a) => a.no),
    [apts, floors],
  )

  const setFloorsPruned = (next: string[]) => {
    const picked = next.map(Number)
    setFloors(picked)
    const keep = new Set((apts ?? []).filter((a) => picked.includes(a.floor)).map((a) => a.no))
    setAptNos((prev) => prev.filter((no) => keep.has(no)))
  }

  // A request is handed over unassigned — naming the executor is part of
  // breaking it down, which happens in the ticket.
  const needsAssignee = col !== 'req'
  // Only whoever owns the breakdown writes the checklist. A director filling
  // one in on a request would let it be published without the manager ever
  // having read it, which is the step the whole flow exists for.
  const showChecklist = ownsBreakdown(actor, track)

  const submit = () => {
    if (!title.trim()) {
      toast({ kind: 'warn', title: 'შეავსეთ სათაური', desc: 'დავალებას სახელი სჭირდება' })
      return
    }
    if (!floors.length) {
      toast({ kind: 'warn', title: 'აირჩიეთ სართული', desc: 'ლოკაციის გარეშე ზედამხედველმა არ იცის სად წავიდეს' })
      return
    }
    if (needsAssignee && !whoId) {
      toast({ kind: 'warn', title: 'აირჩიეთ შემსრულებელი', desc: 'ახალი დავალება ვიღაცას უნდა ერგებოდეს' })
      return
    }
    create.mutate(
      {
        title: title.trim(),
        desc: desc.trim(),
        track,
        col,
        pri,
        floors: [...floors].sort((a, b) => a - b),
        apts: aptNos,
        // A request goes over unassigned even if the picker was filled in before
        // the target column was switched — the assignee field is hidden by then,
        // so a stale value would be invisible and unremovable.
        whoId: needsAssignee ? whoId || null : null,
        who: needsAssignee ? (QA_TEAM.find((m) => m.id === whoId)?.name ?? '') : '',
        ...(parent ? { parentId: parent.id } : {}),
        checklist: items,
      },
      {
        onSuccess: (task) => {
          toast({
            kind: 'ok',
            title: parent ? 'ქვე-დავალება შეიქმნა' : 'დავალება შეიქმნა',
            desc: `${task.id} · ${TASK_COL_LABEL[task.col]}`,
          })
          onCreated?.(task)
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-160">
        <DialogHeader>
          <DialogTitle>{parent ? 'ქვე-დავალების შექმნა' : 'ახალი დავალება'}</DialogTitle>
          <p className="text-xs text-mut">
            {parent ? `${parent.id} — ${parent.title}` : project.name}
          </p>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Field label="სათაური">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="რა უნდა შესრულდეს" />
          </Field>

          <Field label="აღწერა">
            <Textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="დეტალები, სტანდარტი, რაზე გაამახვილოს ყურადღება"
            />
          </Field>

          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] [&>*]:min-w-0">
            <Field label="პრიორიტეტი">
              <select className={CONTROL} value={pri} onChange={(e) => setPri(e.target.value as Priority)}>
                {(['high', 'med', 'low'] as Priority[]).map((p) => (
                  <option key={p} value={p}>{PRI_LABEL[p]}</option>
                ))}
              </select>
            </Field>

            {/* Only shown when there is a real choice — a director who can file
                nothing but requests should not be asked which kind. */}
            {cols.length > 1 && (
              <Field label="სად ხვდება">
                <select className={CONTROL} value={col} onChange={(e) => setCol(e.target.value as TaskColumn)}>
                  {cols.map((c) => (
                    <option key={c} value={c}>{TASK_COL_LABEL[c]}</option>
                  ))}
                </select>
              </Field>
            )}

            {tracks.length > 1 && (
              <Field label="ნაკადი">
                <select className={CONTROL} value={track} onChange={(e) => setTrack(e.target.value as TaskTrack)}>
                  {tracks.map((t) => (
                    <option key={t} value={t}>{TRACK_LABEL[t]}</option>
                  ))}
                </select>
              </Field>
            )}

            {needsAssignee && (
              <Field label="შემსრულებელი">
                <select className={CONTROL} value={whoId} onChange={(e) => setWhoId(e.target.value)}>
                  <option value="">აირჩიეთ…</option>
                  {QA_TEAM.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <Field label="სართული">
            <ToggleGroup
              options={allFloors.map((f) => ({ value: String(f), label: `მე-${f}` }))}
              value={floors.map(String)}
              onChange={setFloorsPruned}
              empty="ბინები იტვირთება…"
            />
          </Field>

          <Field label="ბინა">
            <p className="-mt-0.5 mb-1 text-[11px] text-mut-2">
              არჩევითი — ცარიელი ნიშნავს მთელ სართულს
            </p>
            {floors.length === 0 ? (
              <div className="py-1.75 text-[11px] text-mut-2">ჯერ აირჩიეთ სართული</div>
            ) : (
              <>
                <div className="max-h-40 overflow-y-auto overscroll-contain rounded-lg border border-line-2 px-2">
                  <ToggleGroup
                    options={aptsOnFloors.map((no) => ({ value: no, label: no }))}
                    value={aptNos}
                    onChange={setAptNos}
                  />
                </div>
                <div className="mt-1.5 flex gap-2 text-[11px]">
                  <button type="button" className="cursor-pointer font-semibold text-brand-dark" onClick={() => setAptNos(aptsOnFloors)}>
                    ყველა
                  </button>
                  <button type="button" className="cursor-pointer font-semibold text-mut-2" onClick={() => setAptNos([])}>
                    გასუფთავება
                  </button>
                </div>
              </>
            )}
          </Field>

          {showChecklist && (
            <Field label={col === 'req' ? 'ჩეკლისტი — არჩევითი' : 'ჩეკლისტი — რა უნდა გააკეთოს'}>
              <div className="space-y-1.5">
                {items.map((text, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      value={text}
                      placeholder={`პუნქტი ${i + 1}`}
                      onChange={(e) => setItems((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(items.length === 1 && 'invisible')}
                      onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setItems((prev) => [...prev, ''])}>
                  <Plus className="h-3.5 w-3.5" /> პუნქტის დამატება
                </Button>
              </div>
            </Field>
          )}
        </DialogBody>

        <DialogFooter className="flex-col-reverse sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>
            გაუქმება
          </Button>
          <Button className="w-full sm:w-auto" onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'ინახება…' : 'შექმნა'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
