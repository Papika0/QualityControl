import { Camera, MapPin } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSetDefectStatus } from '@/api/mutations'
import { PRI_LABEL, RECO, nextDefectStatus, type Defect } from '@/data/domain'
import { cn } from '@/lib/utils'

const TIMELINE = (d: Defect) => [
  { t: 'შეიქმნა ველზე', d: `18 ივლ 09:14 · ${d.who}` },
  { t: 'მიენიჭა შემსრულებელს', d: `18 ივლ 10:02 · ${d.sub} · Push+Email` },
  { t: 'გამოსწორება / After ფოტო', d: '24 ივლ 15:41' },
  { t: 'მიღება და დახურვა', d: 'QA ვიზუალური კონტროლი' },
]

export function DefectDialog({
  defect,
  onClose,
}: {
  defect: Defect | null
  onClose: () => void
}) {
  const advance = useSetDefectStatus()

  if (!defect) return null
  const doneIdx = { 'ღია': 1, 'მიმდინარე': 2, 'შემოწმებაზე': 3, 'დახურული': 4 }[defect.st] ?? 1
  const next = nextDefectStatus(defect.st)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle>{defect.id}</DialogTitle>
            <StatusBadge status={defect.st} />
            <Badge className="bg-soft-2 text-mut-3">{PRI_LABEL[defect.pri]}</Badge>
          </div>
          <p className="text-xs text-mut">
            {defect.cat} · ბინა {defect.apt} · {defect.room}
          </p>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-line-2 bg-soft text-mut-2">
              <div className="text-center text-xs">
                <Camera className="mx-auto mb-1 h-5 w-5" />
                Before ფოტო
                <div className="mt-1 flex items-center justify-center gap-1 text-[10px]">
                  <MapPin className="h-3 w-3" /> GPS 41.7093, 44.7395
                </div>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-mut-2">აღწერა</div>
                <p className="mt-0.5">{defect.desc}</p>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-mut-2">რეკომენდაცია (ავტო)</div>
                <p className="mt-0.5 text-xs text-mut-3">{RECO[defect.cat] ?? RECO.Other}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase text-mut-2">შემსრულებელი</div>
                  {defect.sub}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-mut-2">ვადა</div>
                  {defect.due}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-mut-2">დააფიქსირა</div>
                  {defect.who}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-mut-2">პროცესი</div>
            <div className="space-y-0">
              {TIMELINE(defect).map((s, i) => (
                <div key={s.t} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'h-3 w-3 rounded-full border-2',
                        i < doneIdx
                          ? 'border-ok bg-ok'
                          : i === doneIdx
                            ? 'border-brand-ring bg-brand'
                            : 'border-line-2 bg-card',
                      )}
                    />
                    {i < 3 && <div className="w-px flex-1 bg-line" />}
                  </div>
                  <div className="pb-4">
                    <div className={cn('text-sm font-semibold', i > doneIdx && 'text-mut-2')}>{s.t}</div>
                    <div className="text-xs text-mut">{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            დახურვა
          </Button>
          <Button variant="outline">PDF ანგარიში</Button>
          <Button
            disabled={!next || advance.isPending}
            onClick={() => next && advance.mutate({ id: defect.id, st: next })}
          >
            {next ? `სტატუსი → ${next}` : '✓ დახურულია'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
