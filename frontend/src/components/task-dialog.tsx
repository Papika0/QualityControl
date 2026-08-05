import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BellRing, Check } from 'lucide-react'
import { taskCommentsQuery } from '@/api/queries'
import { useAddTaskComment } from '@/api/mutations'
import { PRI_LABEL, nextTaskColumn, type Task, type TaskColumn } from '@/data/domain'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatStamp, hash01, initials } from '@/lib/utils'

const COL_LABEL: Record<TaskColumn, string> = {
  new: 'ახალი', prog: 'მიმდინარე', check: 'შემოწმებაზე', done: 'დასრულებული',
}
const COL_COLOR: Record<TaskColumn, [string, string]> = {
  new: ['#FFE7DB', '#C2410C'], prog: ['#E5EBFC', '#2447C6'],
  check: ['#F6EDD6', '#92670A'], done: ['#DFF0E7', '#0E7D52'],
}
const CHECKLIST = [
  'ვიზუალური დათვალიერება',
  'გაზომვა და ნორმასთან შედარება',
  'ფოტოფიქსაცია (Before)',
  'ხარვეზების რეგისტრაცია',
  'აქტის მომზადება',
  'ხელახალი შემოწმება',
]

export function TaskDialog({
  task,
  onClose,
  onAdvance,
  advancing,
}: {
  task: Task
  onClose: () => void
  onAdvance: (id: string, next: TaskColumn) => void
  advancing: boolean
}) {
  const { data: comments = [] } = useQuery(taskCommentsQuery(task.id))
  const addComment = useAddTaskComment(task.id)
  const [draft, setDraft] = useState('')

  const submit = () => {
    const text = draft.trim()
    if (!text || addComment.isPending) return
    addComment.mutate(text)
    setDraft('')
  }

  const k = task.col
  const total = 3 + Math.floor(hash01(task.id) * 3)
  const done = k === 'done' ? total : k === 'check' ? total - 1 : k === 'prog' ? Math.ceil(total / 2) : 0
  const next = nextTaskColumn(k)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle>{task.id}</DialogTitle>
            <Badge style={{ backgroundColor: COL_COLOR[k][0], color: COL_COLOR[k][1] }}>{COL_LABEL[k]}</Badge>
            <Badge className="bg-soft-2 text-mut-3">{PRI_LABEL[task.pri]}</Badge>
          </div>
          <p className="text-xs text-mut">{task.title}</p>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <p className="text-sm text-mut-3">
            შეასრულეთ „{task.type}" — {task.loc}. თითოეული პუნქტი მონიშნეთ checklist-ში, შედეგები დააფიქსირეთ
            ფოტოთი (GPS და დრო ჩაიწერება ავტომატურად). დასრულების შემდეგ სტატუსი გადადის „შემოწმებაზე".
          </p>

          <div className="grid gap-2 text-xs grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
            {[
              ['ლოკაცია', task.loc],
              ['ვადა', task.due],
              ['შემსრულებელი', task.who],
              ['ტიპი', task.type],
            ].map(([label, v]) => (
              <div key={label}>
                <div className="text-[10px] font-bold uppercase text-mut-2">{label}</div>
                <div className="mt-0.5 font-semibold">{v}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wide text-mut-2">Checklist</div>
              <div className="text-xs font-bold text-mut-3">{done} / {total}</div>
            </div>
            <div className="space-y-1">
              {CHECKLIST.slice(0, total).map((item, i) => (
                <div key={item} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={cn(
                      'flex h-4.5 w-4.5 items-center justify-center rounded border',
                      i < done ? 'border-ok bg-ok text-white' : 'border-line-2 bg-card',
                    )}
                  >
                    {i < done && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn(i < done && 'text-mut-2 line-through')}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-mut-2">კომენტარები</div>
            <div className="space-y-2.5">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-soft-2 text-[10px] font-bold text-mut-3">
                    {initials(c.who)}
                  </div>
                  <div>
                    <div className="text-xs">
                      <b>{c.who}</b> <span className="text-mut-2">· {formatStamp(c.at)}</span>
                    </div>
                    <div className="text-sm">{c.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="კომენტარი…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <Button variant="secondary" onClick={submit} disabled={addComment.isPending}>
                გაგზავნა
              </Button>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline">
            <BellRing className="h-4 w-4" /> შეხსენება
          </Button>
          <Button disabled={!next || advancing} onClick={() => next && onAdvance(task.id, next)}>
            {next ? `სტატუსი → ${COL_LABEL[next]}` : '✓ დასრულებულია'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
