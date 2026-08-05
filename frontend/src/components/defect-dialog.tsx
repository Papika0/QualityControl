import { useState } from 'react'
import { Bell, ChevronLeft, CornerUpLeft, Send } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSetDefectStatus } from '@/api/mutations'
import { useToast } from '@/lib/toast'
import { DEFECT_FLOW, PRI_LABEL, RECO, nextDefectStatus, type Defect } from '@/data/domain'
import { cn } from '@/lib/utils'

const ANNOTATION_TOOLS = [
  ['circle', '○ წრე'],
  ['arrow', '↗ ისარი'],
  ['text', 'T ტექსტი'],
  ['measure', '⟷ ზომა'],
] as const

/** Hatched placeholder standing in for a field photo. */
const HATCH =
  'bg-[repeating-linear-gradient(45deg,#EDEFEA,#EDEFEA_7px,#E4E7E1_7px,#E4E7E1_14px)]'

const TIMELINE = (d: Defect) => [
  { t: 'შეიქმნა ველზე', d: `18 ივლ 09:14 · ${d.who}` },
  { t: 'მიენიჭა შემსრულებელს', d: `18 ივლ 10:02 · ${d.sub} · Push+Email` },
  { t: 'გამოსწორება / After ფოტო', d: '24 ივლ 15:41' },
  { t: 'მიღება და დახურვა', d: 'QA ვიზუალური კონტროლი' },
]

const COMMENTS = [
  {
    ini: 'გკ',
    n: 'გ. კვარაცხელია',
    time: '18 ივლ 09:20',
    t: 'ფოტოზე მონიშნულია პრობლემური უბანი. საჭიროა სრული დემონტაჟი.',
  },
  {
    ini: 'ლჩ',
    n: 'ლ. ჩხეიძე',
    time: '19 ივლ 11:05',
    t: 'მასალა შეკვეთილია, სამუშაო დაიწყება ორშაბათს.',
  },
]

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] bg-soft px-3 py-2.25">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-mut-2">{label}</div>
      <div className="mt-0.5 text-[13px] font-bold">{value}</div>
    </div>
  )
}

export function DefectDialog({ defect, onClose }: { defect: Defect | null; onClose: () => void }) {
  const toast = useToast()
  // The write invalidates the defect queries, so the row this dialog renders
  // comes back with the new status — no local status state to keep in sync.
  const setStatus = useSetDefectStatus()
  const [tool, setTool] = useState<string>('circle')
  const [comment, setComment] = useState('')

  if (!defect) return null

  const st = defect.st
  const doneIdx = DEFECT_FLOW.indexOf(st)
  const next = nextDefectStatus(st)
  const canReopen = st === 'შემოწმებაზე' || st === 'დახურული'

  const advance = () => {
    if (!next) return
    setStatus.mutate(
      { id: defect.id, st: next },
      {
        onSuccess: () =>
          toast({
            kind: 'ok',
            title: `სტატუსი შეიცვალა: ${next}`,
            desc: 'ჩაიწერა ისტორიაში, შეტყობინება გაიგზავნა',
          }),
      },
    )
  }

  const reopen = () =>
    setStatus.mutate(
      { id: defect.id, st: 'ღია' },
      {
        onSuccess: () =>
          toast({
            kind: 'warn',
            title: 'დაბრუნდა გამოსასწორებლად — სტატუსი: ღია',
            desc: 'მიზეზი ჩაიწერა Audit Log-ში, Push გაეგზავნა',
          }),
      },
    )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-225">
        <DialogHeader className="flex flex-wrap items-center gap-2.5 pr-14">
          <button
            onClick={onClose}
            title="უკან"
            className="grid h-7.5 w-7.5 flex-none cursor-pointer place-items-center rounded-lg bg-soft-2 text-mut-3 hover:bg-line"
          >
            <ChevronLeft className="h-3.75 w-3.75" />
          </button>
          <span className="font-mono text-xs text-mut">{defect.id}</span>
          <DialogTitle>
            {defect.cat} — {defect.room}
          </DialogTitle>
          <StatusBadge status={st} />
          <span className="rounded-full bg-soft-2 px-2.5 py-0.75 text-[10px] font-bold text-mut-3">
            {PRI_LABEL[defect.pri]}
          </span>
        </DialogHeader>

        <DialogBody className="flex flex-wrap gap-4.5">
          {/* Annotated photo column */}
          <div className="min-w-[min(320px,100%)] flex-[1.25]">
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {ANNOTATION_TOOLS.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTool(id)}
                  className={cn(
                    'cursor-pointer rounded-[7px] border px-2.75 py-1.5 text-[11.5px] font-semibold',
                    tool === id
                      ? 'border-chip-a bg-chip-a text-chip-a-fg'
                      : 'border-line-2 bg-card text-mut-3 hover:bg-soft',
                  )}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto self-center text-[10.5px] text-mut-2">
                ანოტაცია ინახება ფოტოს ზედა ფენად
              </span>
            </div>

            <div className="relative aspect-[4/3] cursor-crosshair overflow-hidden rounded-xl bg-soft-3">
              <span className="absolute left-2.5 top-2.5 rounded-full bg-ink px-2.25 py-0.75 text-[10px] font-bold text-card">
                BEFORE · 18 ივლ 09:16
              </span>
              <span className="absolute bottom-2.5 right-2.5 rounded-[5px] bg-ink/80 px-1.75 py-0.5 font-mono text-[9px] text-card">
                GPS 41.7093, 44.7395
              </span>
              <span className="absolute left-[24%] top-[30%] h-21 w-21 rounded-full border-[3px] border-brand shadow-[0_0_0_2px_rgba(255,77,0,0.25)]" />
              <svg
                className="absolute left-[46%] top-[24%]"
                width="110"
                height="70"
                viewBox="0 0 110 70"
                fill="none"
              >
                <path d="M105 8 L38 52" stroke="#FF4D00" strokeWidth="3" />
                <path d="M50 54 L38 52 L44 41" stroke="#FF4D00" strokeWidth="3" fill="none" />
              </svg>
              <span className="absolute left-[58%] top-[8%] rounded-lg bg-brand px-2.5 py-1 text-[11px] font-bold text-white">
                არასწორი წებო
              </span>
            </div>

            <div className="mt-2.5 flex gap-2">
              <div className={cn('relative aspect-video flex-1 rounded-[9px] border-2 border-brand', HATCH)}>
                <span className="absolute bottom-1.25 left-1.5 rounded-full bg-ink px-1.5 py-px text-[8.5px] font-bold text-card">
                  BEFORE
                </span>
              </div>
              <div className={cn('relative aspect-video flex-1 rounded-[9px] opacity-85', HATCH)}>
                <span className="absolute bottom-1.25 left-1.5 rounded-full bg-ok px-1.5 py-px text-[8.5px] font-bold text-white">
                  AFTER
                </span>
              </div>
              <button className="grid aspect-video flex-1 cursor-pointer place-items-center rounded-[9px] border-[1.5px] border-dashed border-line-2 text-lg text-mut-2 hover:border-brand hover:text-brand">
                ＋
              </button>
            </div>
          </div>

          {/* Detail column */}
          <div className="min-w-[min(280px,100%)] flex-1">
            <div className="mb-3.25 grid grid-cols-2 gap-2.25">
              <InfoTile label="ბინა" value={defect.apt} />
              <InfoTile label="ვადა" value={defect.due} />
              <InfoTile label="ინსპექტორი" value={defect.who} />
              <InfoTile label="შემსრულებელი" value={defect.sub} />
            </div>

            <div className="mb-3.25 rounded-[11px] border border-[#EFE2CB] bg-[#FBF6EE] px-3.5 py-3">
              <div className="mb-1.25 text-[10px] font-bold tracking-[0.08em] text-[#8A5A18]">
                ⚡ გამოსასწორებელი ღონისძიება (ავტო)
              </div>
              <div className="text-[12.5px] leading-[1.6] text-[#4A4232]">
                {RECO[defect.cat] ?? RECO.Other}
              </div>
            </div>

            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-mut-2">
              პროცესი
            </div>
            <div className="flex flex-col">
              {TIMELINE(defect).map((s, i) => (
                <div key={s.t} className="flex gap-2.75">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'h-2.75 w-2.75 flex-none rounded-full border-2',
                        i < doneIdx
                          ? 'border-ok bg-ok'
                          : i === doneIdx
                            ? 'border-brand-ring bg-brand'
                            : 'border-line-2 bg-card',
                      )}
                    />
                    {i < 3 && <span className="min-h-4.5 w-0.5 flex-1 bg-line" />}
                  </div>
                  <div className="pb-3.5">
                    <div
                      className={cn(
                        'text-[12.5px] font-semibold',
                        i > doneIdx ? 'text-mut-2' : 'text-ink',
                      )}
                    >
                      {s.t}
                    </div>
                    <div className="text-[11px] text-mut-2">{s.d}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-2 mt-3.5 text-[10px] font-bold uppercase tracking-[0.1em] text-mut-2">
              კომენტარები
            </div>
            {COMMENTS.map((c) => (
              <div key={c.time} className="mb-2.25 flex gap-2.25">
                <span className="grid h-6.5 w-6.5 flex-none place-items-center rounded-lg bg-soft-2 text-[10px] font-bold text-mut-3">
                  {c.ini}
                </span>
                <div className="flex-1 rounded-[10px] bg-soft px-2.75 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-bold">{c.n}</span>
                    <span className="text-[9.5px] text-mut-2">{c.time}</span>
                  </div>
                  <div className="mt-0.5 text-xs leading-[1.5]">{c.t}</div>
                </div>
              </div>
            ))}

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!comment.trim()) return
                setComment('')
                toast({
                  kind: 'info',
                  title: 'კომენტარი დაემატა',
                  desc: 'მონაწილეებს გაეგზავნა შეტყობინება',
                })
              }}
            >
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="კომენტარი… @ მოხსენიება"
                className="min-w-0 flex-1 rounded-[9px] border border-line-2 bg-card px-3 py-2.25 text-[12.5px]"
              />
              <button
                type="submit"
                title="გაგზავნა"
                className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-[9px] bg-brand text-white shadow-[0_4px_12px_rgba(255,77,0,0.25)]"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </DialogBody>

        <DialogFooter className="flex-wrap justify-start gap-2.5">
          <Button
            variant="secondary"
            className="bg-ink text-card hover:bg-[#2A3138]"
            onClick={advance}
            disabled={!next || setStatus.isPending}
          >
            {next ? `სტატუსი → ${next}` : '✓ დახურულია'}
          </Button>
          {canReopen && (
            <Button
              variant="outline"
              className="border-[#E3B9B0] text-danger hover:bg-danger-soft"
              onClick={reopen}
              disabled={setStatus.isPending}
            >
              <CornerUpLeft className="h-3.5 w-3.5" /> დაბრუნება გამოსასწორებლად
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() =>
              toast({
                kind: 'ok',
                title: 'PDF ანგარიში მომზადდა',
                desc: `${defect.id} · გაეგზავნა PM-ს და ტექ. დირექტორს`,
              })
            }
          >
            PDF ანგარიში
          </Button>
          <Button
            variant="outline"
            className="ml-auto"
            onClick={() => toast({ kind: 'info', title: 'შეხსენება გაიგზავნა', desc: defect.sub })}
          >
            <Bell className="h-3.5 w-3.5" /> შეხსენება შემსრულებელს
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
