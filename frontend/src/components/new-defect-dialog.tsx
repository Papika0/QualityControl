import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, ChevronLeft, ImageIcon } from 'lucide-react'
import { apartmentsQuery } from '@/api/queries'
import { useCreateDefect } from '@/api/mutations'
import { DEFECT_DUE_DAYS, addDays } from '@/api/client'
import { CATS, PEOPLE, PRI_LABEL, RECO, SUBS, TODAY, type Defect, type Priority } from '@/data/domain'
import { useSession } from '@/lib/session'
import { useToast } from '@/lib/toast'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const LABEL = 'mb-1.25 block text-[10px] font-semibold uppercase tracking-[0.1em] text-mut'
const CONTROL = 'w-full rounded-lg border border-line-2 bg-card px-2.75 py-2.25 text-[13px]'

// The prototype's room list for a defect — the domain ROOMS plus the corridor,
// which only ever appears as a defect location, never as a generated room.
const ROOM_OPTIONS = ['სველი წერტილი', 'სამზარეულო', 'მისაღები', 'საძინებელი', 'ჰოლი', 'დერეფანი']

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  )
}

export function NewDefectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** Handed the saved row so the caller can reveal it — a new defect can land
   *  anywhere in a 500-row list and would otherwise go unnoticed. */
  onCreated?: (defect: Defect) => void
}) {
  const { project } = useSession()
  const toast = useToast()
  const { data: apts } = useQuery(apartmentsQuery(project.id))
  const create = useCreateDefect()
  const [cat, setCat] = useState<string>('Tiles')
  const [floor, setFloor] = useState('12')
  const [apt, setApt] = useState('1204')
  const [room, setRoom] = useState<string>(ROOM_OPTIONS[0]!)
  const [pri, setPri] = useState<Priority>('high')
  const [sub, setSub] = useState<string>(SUBS[0]!)
  const [who, setWho] = useState<string>(PEOPLE[1]!)
  const [reco, setReco] = useState<string | null>(null)

  const floors = useMemo(
    () => [...new Set((apts ?? []).map((a) => a.floor))].sort((a, b) => b - a),
    [apts],
  )
  const aptsOnFloor = useMemo(
    () => (apts ?? []).filter((a) => a.floor === Number(floor)),
    [apts, floor],
  )

  const desc = reco ?? RECO[cat] ?? RECO.Other!

  const submit = () => {
    if (create.isPending) return
    create.mutate(
      { apt, room, cat, pri, sub, who, desc: desc.trim() },
      {
        onSuccess: (defect) => {
          onCreated?.(defect)
          onClose()
          toast({
            kind: 'ok',
            title: `${defect.id} დაფიქსირდა`,
            desc: 'Push + Email გაეგზავნა შემსრულებელს და PM-ს',
          })
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-170">
        <DialogHeader className="flex items-center gap-2.5 pr-14">
          <button
            onClick={onClose}
            title="უკან"
            className="grid h-7.5 w-7.5 flex-none cursor-pointer place-items-center rounded-lg bg-soft-2 text-mut-3 hover:bg-line"
          >
            <ChevronLeft className="h-3.75 w-3.75" />
          </button>
          <DialogTitle>ხარვეზის დაფიქსირება</DialogTitle>
          {/* The id is assigned on save, so the draft only shows its shape. */}
          <span className="font-mono text-[11px] text-mut-2">QA-{apt}-… (დრაფტი)</span>
        </DialogHeader>

        <DialogBody className="space-y-0 px-5 py-4.5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.25">
            <Field label="სართული">
              <select
                className={`${CONTROL} cursor-pointer`}
                value={floor}
                onChange={(e) => {
                  setFloor(e.target.value)
                  const first = (apts ?? []).find((a) => a.floor === Number(e.target.value))
                  if (first) setApt(first.no)
                }}
              >
                {floors.map((f) => (
                  <option key={f} value={String(f)}>
                    სართული {f}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="ბინა">
              <select
                className={`${CONTROL} cursor-pointer`}
                value={apt}
                onChange={(e) => setApt(e.target.value)}
              >
                {aptsOnFloor.map((a) => (
                  <option key={a.no} value={a.no}>
                    ბინა {a.no}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="ოთახი">
              <select
                className={`${CONTROL} cursor-pointer`}
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              >
                {ROOM_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="კატეგორია">
              <select
                className={`${CONTROL} cursor-pointer`}
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value)
                  setReco(null)
                }}
              >
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="პრიორიტეტი">
              <select
                className={`${CONTROL} cursor-pointer`}
                value={pri}
                onChange={(e) => setPri(e.target.value as Priority)}
              >
                {(['high', 'med', 'low'] as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRI_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="შემსრულებელი">
              <select
                className={`${CONTROL} cursor-pointer`}
                value={sub}
                onChange={(e) => setSub(e.target.value)}
              >
                {SUBS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="პასუხისმგებელი QA">
              <select
                className={`${CONTROL} cursor-pointer`}
                value={who}
                onChange={(e) => setWho(e.target.value)}
              >
                {PEOPLE.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="ვადა">
              {/* Fixed by policy — every defect gets the same window to be fixed. */}
              <div className={`${CONTROL} text-mut-3`}>{addDays(TODAY, DEFECT_DUE_DAYS)}</div>
            </Field>

            <Field label="შეტყობინება">
              <div className="flex gap-1.5 py-1.75">
                <span className="rounded-full bg-brand-soft px-2.25 py-0.75 text-[10.5px] font-bold text-brand-dark">
                  Push
                </span>
                <span className="rounded-full bg-brand-soft px-2.25 py-0.75 text-[10.5px] font-bold text-brand-dark">
                  Email
                </span>
                <span className="rounded-full bg-soft-2 px-2.25 py-0.75 text-[10.5px] font-semibold text-mut-2">
                  SMS
                </span>
              </div>
            </Field>
          </div>

          <div className="pt-1.5">
            <div className="mb-1.5 flex items-center gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mut">
                გამოსასწორებელი ღონისძიება
              </label>
              <span className="rounded-full border border-[#EFE2CB] bg-[#FBF6EE] px-2 py-0.5 text-[10px] font-bold text-[#8A5A18]">
                ⚡ ავტომატურად ჩაისვა — კატეგორიიდან
              </span>
            </div>
            <textarea
              rows={3}
              className="w-full resize-y rounded-[10px] border border-[#EFE2CB] bg-[#FDFBF6] px-3.25 py-2.75 text-[12.5px] leading-[1.6] text-[#4A4232]"
              value={desc}
              onChange={(e) => setReco(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2.5 pt-2.5">
            <div className="flex min-w-55 flex-1 gap-2">
              <label className="flex flex-[1.2] cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-[#FF9A6B] bg-[#FFF8F4] px-2.5 py-3.5 text-center text-xs font-bold text-brand-dark hover:border-brand hover:bg-brand-soft">
                <Camera className="h-5 w-5" />
                გადაღება — კამერა
                <input type="file" accept="image/*" capture="environment" className="hidden" />
              </label>
              <label className="flex flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-line-2 px-2.5 py-3.5 text-center text-xs font-semibold text-mut-2 hover:border-brand hover:text-brand-dark">
                <ImageIcon className="h-5 w-5" />
                გალერეიდან
                <input type="file" accept="image/*" multiple className="hidden" />
              </label>
            </div>
            <div className="flex gap-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="relative h-16.5 w-16.5 rounded-[10px]"
                  style={{
                    background:
                      'repeating-linear-gradient(45deg,#EDEFEA,#EDEFEA 6px,#E4E7E1 6px,#E4E7E1 12px)',
                  }}
                >
                  <span className="absolute bottom-1 left-1 rounded-full bg-ink px-1.25 py-px text-[8px] text-white">
                    GPS ✓
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            გაუქმება
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'ინახება…' : 'დაფიქსირება და გაგზავნა'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
