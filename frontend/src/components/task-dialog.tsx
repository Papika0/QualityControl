import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Pencil, Plus, Send, ShieldCheck, X } from 'lucide-react'
import { taskCommentsQuery, taskPhotosQuery } from '@/api/queries'
import {
  useAddTaskComment,
  useAdvanceTask,
  useSetTaskReady,
  useSetTaskTechOk,
  useToggleChecklist,
  useUpdateTask,
} from '@/api/mutations'
import type { Photo, TaskBlock } from '@/api/client'
import {
  PRI_LABEL,
  QA_TEAM,
  TASK_COL_LABEL,
  TASK_FLOW,
  checklistProgress,
  statusColor,
  taskLocation,
  type Task,
  type TaskChecklistItem,
} from '@/data/domain'
import { useTaskActor } from '@/lib/session'
import {
  canBreakDown,
  canEditTask,
  canTechConfirm,
  canTickChecklist,
  isOwn,
  isSupervisor,
  taskAction,
} from '@/lib/task-perms'
import { useBlobUrls } from '@/lib/blob-url'
import type { PreparedPhoto } from '@/lib/image'
import { useToast } from '@/lib/toast'
import { cn, formatStamp, initials } from '@/lib/utils'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { PhotoPicker } from '@/components/photo-picker'

/** Stable empty array — `useBlobUrls` re-runs forever on a fresh `[]` each render. */
const NO_PHOTOS: Photo[] = []

const MAX_COMMENT_PHOTOS = 4

const BLOCK_MESSAGE: Record<TaskBlock, string> = {
  assignee: 'ჯერ დანიშნეთ შემსრულებელი',
  breakdown: 'ჯერ ჩაშალეთ — ჩეკლისტი ან ქვე-დავალება',
  ready: 'ელოდება ზედამხედველის მზადყოფნას',
  tech: 'საჭიროა ტექნიკური დადასტურება',
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase text-mut-2">{label}</div>
      <div className="mt-0.5 font-semibold break-words">{value || '—'}</div>
    </div>
  )
}

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2 text-[11px] font-bold uppercase tracking-wide text-mut-2', className)}>
      {children}
    </div>
  )
}

/** Section heading with a control or a counter on the right, baselines aligned. */
function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
      <SectionLabel className="mb-0">{title}</SectionLabel>
      {children}
    </div>
  )
}

/**
 * What the primary button says when this actor has nothing to do. Naming who
 * the task is waiting on beats a flat "you have no action" — a director looking
 * at their own request should see that it sits with the manager.
 */
function idleLabel(task: Task): string {
  if (task.col === 'done') return '✓ დასრულებულია'
  if (task.col === 'req') return 'ელოდება პროექტის მენეჯერს'
  if (task.gate.ready) return 'ელოდება დადასტურებას'
  return 'ელოდება შემსრულებელს'
}

function ColumnBadge({ task }: { task: Task }) {
  const c = statusColor(TASK_COL_LABEL[task.col])
  return <Badge style={{ backgroundColor: c.bg, color: c.c }}>{TASK_COL_LABEL[task.col]}</Badge>
}

export function TaskDialog({
  task,
  subtasks,
  onClose,
  onSelect,
  onAddSubtask,
}: {
  task: Task | null
  /** Sub-tasks of this one, already loaded by the board. */
  subtasks: Task[]
  onClose: () => void
  /** Opens another ticket — used to walk into a sub-task. */
  onSelect: (id: string) => void
  onAddSubtask: () => void
}) {
  const actor = useTaskActor()
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [shots, setShots] = useState<PreparedPhoto[]>([])
  const [editing, setEditing] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  const { data: comments = [] } = useQuery({
    ...taskCommentsQuery(task?.id ?? ''),
    enabled: !!task,
  })
  const { data: photoData } = useQuery({
    ...taskPhotosQuery(task?.id ?? ''),
    enabled: !!task,
  })
  const photos = photoData ?? NO_PHOTOS
  const urls = useBlobUrls(photos)

  const addComment = useAddTaskComment(task?.id ?? '')
  const toggleItem = useToggleChecklist()
  const setReady = useSetTaskReady()
  const setTechOk = useSetTaskTechOk()
  const advance = useAdvanceTask()
  const update = useUpdateTask()

  // Newest comment in view — a thread that opens scrolled to the top hides the
  // only line anybody came for.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments.length, task?.id])

  // Everything the user had staged belongs to the ticket they staged it on.
  // Walking into a sub-task keeps this component mounted, so without this the
  // half-written comment and its photos would post to the wrong task.
  useEffect(() => {
    setEditing(false)
    setDraft('')
    setShots([])
  }, [task?.id])

  const byComment = useMemo(() => {
    const map = new Map<string, Photo[]>()
    for (const p of photos) {
      const key = p.commentId ?? ''
      map.set(key, [...(map.get(key) ?? []), p])
    }
    return map
  }, [photos])

  if (!task) return null

  const action = taskAction(actor, task, subtasks.length)
  const canEdit = canEditTask(actor, task)
  const canSplit = canBreakDown(actor, task)
  const canTick = canTickChecklist(actor, task)
  const showTechOk = canTechConfirm(actor, task)
  const progress = checklistProgress(task.checklist)
  const ticked = task.checklist.filter((i) => i.done).length
  const busy = advance.isPending || setReady.isPending || setTechOk.isPending

  const submitComment = () => {
    const text = draft.trim()
    if ((!text && !shots.length) || addComment.isPending) return
    addComment.mutate(
      { text: text || 'ფოტო', photos: shots.length ? shots : undefined },
      {
        onSuccess: () => {
          setDraft('')
          setShots([])
        },
      },
    )
  }

  const runAction = () => {
    if (!action || action.disabled) return
    if (action.kind === 'ready' || action.kind === 'unready') {
      setReady.mutate({ id: task.id, ready: action.kind === 'ready' })
      return
    }
    if (action.kind === 'techok') {
      setTechOk.mutate(
        { id: task.id },
        { onSuccess: () => toast({ kind: 'ok', title: 'ტექნიკურად დადასტურდა', desc: task.id }) },
      )
      return
    }
    advance.mutate(
      { id: task.id },
      {
        onSuccess: (res) => {
          if (res.ok && res.task) {
            toast({ kind: 'ok', title: `სტატუსი → ${TASK_COL_LABEL[res.task.col]}`, desc: task.id })
          } else if (res.blockedBy) {
            toast({ kind: 'warn', title: 'გადატანა შეჩერდა', desc: BLOCK_MESSAGE[res.blockedBy] })
          }
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="task-dialog" className="max-w-225">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle className="font-mono">{task.id}</DialogTitle>
            <ColumnBadge task={task} />
            <Badge className="bg-soft-2 text-mut-3">{PRI_LABEL[task.pri]}</Badge>
            {task.track === 'tech' && <Badge className="bg-soft-2 text-mut-3">ტექნიკური</Badge>}
            {task.parentId && (
              <button
                className="cursor-pointer text-[11px] font-semibold text-brand-dark underline-offset-2 hover:underline"
                onClick={() => onSelect(task.parentId!)}
              >
                ↑ {task.parentId}
              </button>
            )}
          </div>
          <p className="text-xs text-mut">{task.title}</p>
        </DialogHeader>

        {/* `min-w-[min(320px,100%)]`, not `min-w-0`: a flex item that may shrink
            to nothing never wraps, and the two columns would squeeze to ~160px
            each on a phone instead of stacking. */}
        <DialogBody data-testid="task-body" className="flex flex-wrap items-start gap-5">
          <div data-testid="task-col-left" className="min-w-[min(320px,100%)] flex-[1.15] space-y-5">
            <div className="grid gap-2 text-xs grid-cols-[repeat(auto-fit,minmax(120px,1fr))] *:min-w-0">
              <InfoTile label="ლოკაცია" value={taskLocation(task)} />
              <InfoTile label="შემსრულებელი" value={task.who || 'დაუნიშნავი'} />
              <InfoTile label="ავტორი" value={task.by} />
            </div>

            {editing ? (
              <EditPanel
                // Remount per ticket: the panel seeds its fields from `task`
                // once, so walking into a sub-task mid-edit would otherwise show
                // the previous ticket's text.
                key={task.id}
                task={task}
                saving={update.isPending}
                onCancel={() => setEditing(false)}
                onSave={(patch) =>
                  update.mutate({ id: task.id, patch }, { onSuccess: () => setEditing(false) })
                }
              />
            ) : (
              task.desc && (
                <div>
                  <SectionLabel>დავალების აღწერა</SectionLabel>
                  <p className="rounded-[10px] border border-note-line bg-note-field px-3.25 py-2.75 text-[12.5px] leading-[1.6] text-note-ink">
                    {task.desc}
                  </p>
                </div>
              )
            )}

            <div>
              <SectionHead title="ჩეკლისტი">
                <span className="text-xs font-bold text-mut-3">
                  {ticked} / {task.checklist.length}
                </span>
              </SectionHead>
              {task.checklist.length > 0 && <Progress value={progress} className="mb-2" />}
              {task.checklist.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-center text-[11.5px] text-mut-2">
                  {canSplit
                    ? 'ჩეკლისტი ჯერ არ არის — დაშალეთ დავალება, რომ ზედამხედველმა იცოდეს რა ქნას.'
                    : 'ჩეკლისტი ჯერ არ არის.'}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {task.checklist.map((item) => (
                    <Checkbox
                      key={item.id}
                      checked={item.done}
                      // Only the row being written locks up — disabling the whole
                      // list on every tick makes working through six items feel
                      // like the page is fighting back.
                      disabled={!canTick || toggleItem.variables?.itemId === item.id}
                      label={item.text}
                      hint={item.done && item.by ? `${item.by} · ${formatStamp(item.at)}` : undefined}
                      onCheckedChange={(next) =>
                        toggleItem.mutate({ id: task.id, itemId: item.id, done: next })
                      }
                    />
                  ))}
                </div>
              )}
              {/* Ticking only opens once the work is under way — without this the
                  supervisor just meets dead checkboxes and no reason why. */}
              {!canTick && isSupervisor(actor) && isOwn(actor, task) && task.col === 'new' && (
                <div className="mt-1.5 text-[11px] text-mut-2">
                  ჩეკლისტი გაიხსნება დაწყების შემდეგ.
                </div>
              )}
              {canSplit && !editing && (
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> ჩეკლისტის რედაქტირება
                </Button>
              )}
            </div>

            <div>
              <SectionHead title="ქვე-დავალებები">
                {canSplit && (
                  <Button variant="ghost" size="sm" onClick={onAddSubtask}>
                    <Plus className="h-3.5 w-3.5" /> დამატება
                  </Button>
                )}
              </SectionHead>
              {subtasks.length === 0 ? (
                <div className="text-[11.5px] text-mut-2">ქვე-დავალება არ არის.</div>
              ) : (
                <div className="space-y-1.5">
                  {subtasks.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onSelect(c.id)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-line-2 px-2.5 py-2 text-left hover:border-brand-ring"
                    >
                      <span className="font-mono text-[10px] font-bold text-mut-2">{c.id}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{c.title}</span>
                      <span className="flex-none text-[11px] text-mut">{c.who || 'დაუნიშნავი'}</span>
                      <ColumnBadge task={c} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Timeline task={task} />
          </div>

          <div data-testid="task-col-right" className="min-w-[min(320px,100%)] flex-1 space-y-2">
            <SectionLabel>კომენტარები</SectionLabel>
            <div ref={threadRef} className="max-h-72 space-y-2.5 overflow-y-auto overscroll-contain">
              {comments.length === 0 ? (
                <div className="rounded-lg bg-soft px-3 py-4 text-center text-[11.5px] text-mut-2">
                  კომენტარი ჯერ არ არის — დაწერეთ პირველი.
                </div>
              ) : (
                comments.map((c) => {
                  const shotsOn = byComment.get(c.id) ?? []
                  return (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-soft-2 text-[10px] font-bold text-mut-3">
                        {initials(c.who)}
                      </div>
                      {/* `min-w-0` + `break-words` or one long word drags the
                          whole dialog sideways. */}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs">
                          <b>{c.who}</b> <span className="text-mut-2">· {formatStamp(c.at)}</span>
                        </div>
                        <div className="text-sm break-words">{c.text}</div>
                        {shotsOn.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {shotsOn.map((p) =>
                              urls[p.id] ? (
                                <a
                                  key={p.id}
                                  href={urls[p.id]}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block h-18 w-18 overflow-hidden rounded-lg bg-soft-3"
                                >
                                  <img src={urls[p.id]} alt={p.name} className="h-full w-full object-cover" />
                                </a>
                              ) : null,
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="space-y-2 pt-1">
              <Textarea
                rows={2}
                placeholder="კომენტარი — ან მიამაგრეთ ფოტო"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <PhotoPicker photos={shots} onChange={setShots} max={MAX_COMMENT_PHOTOS} />
              <Button
                variant="secondary"
                className="w-full"
                onClick={submitComment}
                disabled={addComment.isPending || (!draft.trim() && !shots.length)}
              >
                <Send className="h-3.5 w-3.5" /> {addComment.isPending ? 'იგზავნება…' : 'გაგზავნა'}
              </Button>
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="flex-col items-stretch sm:flex-row sm:items-center">
          {/* Spelled out, not a `title`: the button carries
              `disabled:pointer-events-none`, so a tooltip on it can never fire —
              and on a phone there is no hover to fire it with. */}
          {action?.disabled && (
            <span
              data-testid="task-blocked"
              className="w-full text-[11px] font-semibold text-warn sm:mr-auto sm:w-auto"
            >
              {action.disabled}
            </span>
          )}
          {canEdit && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> რედაქტირება
            </Button>
          )}
          {/* The tech sign-off is its own control: it can be given at any point
              from `მიმდინარე` on, without waiting to be the next step. */}
          {showTechOk && !task.gate.techOk && action?.kind !== 'techok' && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                setTechOk.mutate(
                  { id: task.id },
                  { onSuccess: () => toast({ kind: 'ok', title: 'ტექნიკურად დადასტურდა', desc: task.id }) },
                )
              }
            >
              <ShieldCheck className="h-4 w-4" /> ტექნიკური დადასტურება
            </Button>
          )}
          <Button
            data-testid="task-action"
            data-kind={action?.kind ?? 'none'}
            disabled={!action || !!action.disabled || busy}
            onClick={runAction}
          >
            {action?.label ?? idleLabel(task)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The two signatures a task collects, shown under its process timeline. */
function Timeline({ task }: { task: Task }) {
  const reached = new Map((task.history ?? []).map((h) => [h.col, h]))
  return (
    <div>
      <SectionLabel>პროცესი</SectionLabel>
      <div className="space-y-1.5">
        {TASK_FLOW.map((col) => {
          const step = reached.get(col)
          const current = task.col === col
          return (
            <div key={col} className="flex items-center gap-2.5 text-xs">
              <span
                className={cn(
                  'h-2 w-2 flex-none rounded-full',
                  current ? 'bg-brand' : step ? 'bg-ok' : 'bg-card ring-1 ring-line-2',
                )}
              />
              <span className={cn('flex-1', !step && 'text-mut-2')}>{TASK_COL_LABEL[col]}</span>
              <span className="flex-none text-mut-2">
                {step ? `${formatStamp(step.at)} · ${step.who}` : 'მოლოდინში'}
              </span>
            </div>
          )
        })}
      </div>
      {(task.gate.ready || task.gate.techOk) && (
        <div className="mt-2 space-y-1 border-t border-line-2 pt-2 text-[11px]">
          {task.gate.ready && (
            <div className="flex items-center gap-1.5 text-mut-3">
              <Check className="h-3 w-3 text-ok" />
              მზადაა — {task.gate.ready.by} · {formatStamp(task.gate.ready.at)}
            </div>
          )}
          {task.gate.techOk && (
            <div className="flex items-center gap-1.5 text-mut-3">
              <ShieldCheck className="h-3 w-3 text-ok" />
              ტექნიკურად დადასტურებული — {task.gate.techOk.by} · {formatStamp(task.gate.techOk.at)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The manager's breakdown pass: assign somebody, sharpen the wording, and write
 * the steps. Deliberately one panel rather than an edit affordance per field —
 * it is done once, right after the request lands.
 */
function EditPanel({
  task,
  saving,
  onCancel,
  onSave,
}: {
  task: Task
  saving: boolean
  onCancel: () => void
  onSave: (patch: {
    title: string
    desc: string
    whoId: string | null
    who: string
    checklist: TaskChecklistItem[]
  }) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [desc, setDesc] = useState(task.desc)
  const [whoId, setWhoId] = useState(task.whoId ?? '')
  // A counter, not a timestamp: two rows added inside the same millisecond would
  // share an id, and with it a React key.
  const minted = useRef(0)
  const blank = (): TaskChecklistItem => ({
    id: `${task.id}-n${(minted.current += 1)}`,
    text: '',
    done: false,
    by: '',
    at: '',
  })
  // Breaking a request down is the whole point of this panel, so it opens with
  // somewhere to type. An empty list behind a ghost button read as "nothing to
  // do here" — the opposite of the instruction the supervisor is waiting on.
  const [items, setItems] = useState<TaskChecklistItem[]>(
    task.checklist.length ? task.checklist : [blank()],
  )

  const addItem = () => setItems((prev) => [...prev, blank()])

  return (
    <div className="space-y-3 rounded-xl border border-line-2 bg-soft p-3">
      <SectionLabel>ჩაშლა და რედაქტირება</SectionLabel>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="სათაური" />
      <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="აღწერა" />
      <select
        className="w-full rounded-lg border border-line-2 bg-card px-2.75 py-2.25 text-[13px]"
        value={whoId}
        onChange={(e) => setWhoId(e.target.value)}
      >
        <option value="">შემსრულებელი — აირჩიეთ…</option>
        {QA_TEAM.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>

      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={item.id} className="flex gap-1.5">
            <Input
              value={item.text}
              placeholder={`პუნქტი ${i + 1}`}
              onChange={(e) =>
                setItems((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
              }
            />
            <Button variant="ghost" size="icon" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addItem}>
          <Plus className="h-3.5 w-3.5" /> პუნქტის დამატება
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          გაუქმება
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={() =>
            onSave({
              title: title.trim() || task.title,
              desc: desc.trim(),
              whoId: whoId || null,
              who: QA_TEAM.find((m) => m.id === whoId)?.name ?? '',
              // Blank rows are how a line gets removed without a second control.
              checklist: items.filter((i) => i.text.trim()).map((i) => ({ ...i, text: i.text.trim() })),
            })
          }
        >
          {saving ? 'ინახება…' : 'შენახვა'}
        </Button>
      </div>
    </div>
  )
}
