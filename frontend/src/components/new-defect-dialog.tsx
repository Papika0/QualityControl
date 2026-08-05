import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { apartmentsQuery } from '@/api/queries'
import { useCreateDefect } from '@/api/mutations'
import { CATS, PEOPLE, PRI_LABEL, RECO, ROOMS, SUBS, type Defect, type Priority } from '@/data/domain'
import { useSession } from '@/lib/session'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function NewDefectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** Handed the saved row so the caller can reveal it — a new defect is appended
   *  to the end of a 500-row list and would otherwise land off-screen. */
  onCreated?: (defect: Defect) => void
}) {
  const { project } = useSession()
  const { data: apts } = useQuery(apartmentsQuery(project.id))
  const create = useCreateDefect()
  const [cat, setCat] = useState<string>('Tiles')
  const [floor, setFloor] = useState('12')
  const [apt, setApt] = useState('1204')
  const [room, setRoom] = useState<string>(ROOMS[1]!)
  const [pri, setPri] = useState<Priority>('med')
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
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ახალი ხარვეზი — ბინა {apt} (დრაფტი)</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-mut-3">სართული</label>
              <Select
                value={floor}
                onValueChange={(f) => {
                  setFloor(f)
                  const first = (apts ?? []).find((a) => a.floor === Number(f))
                  if (first) setApt(first.no)
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {floors.map((f) => (
                    <SelectItem key={f} value={String(f)}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-mut-3">ბინა</label>
              <Select value={apt} onValueChange={setApt}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {aptsOnFloor.map((a) => (
                    <SelectItem key={a.no} value={a.no}>{a.no}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-mut-3">კატეგორია</label>
              <Select
                value={cat}
                onValueChange={(c) => {
                  setCat(c)
                  setReco(null)
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-mut-3">
              რეკომენდაცია — ჩაისვა ავტომატურად კატეგორიის მიხედვით
            </label>
            <textarea
              className="min-h-24 w-full rounded-lg border border-line-2 bg-card p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
              value={desc}
              onChange={(e) => setReco(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-mut-3">ოთახი</label>
              <Select value={room} onValueChange={setRoom}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROOMS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-mut-3">პრიორიტეტი</label>
              <Select value={pri} onValueChange={(p) => setPri(p as Priority)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['high', 'med', 'low'] as Priority[]).map((p) => (
                    <SelectItem key={p} value={p}>{PRI_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-mut-3">შემსრულებელი (ქვეკონტრაქტორი)</label>
              <Select value={sub} onValueChange={setSub}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-mut-3">პასუხისმგებელი QA</label>
              <Select value={who} onValueChange={setWho}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PEOPLE.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 bg-soft p-6 text-sm font-semibold text-mut-3 hover:bg-soft-2">
            <Camera className="h-4 w-4" />
            ფოტოს დამატება — GPS და დროის შტამპი ჩაიწერება ავტომატურად
            <input type="file" accept="image/*" multiple className="hidden" />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>გაუქმება</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'ინახება…' : 'დაფიქსირება — Push + Email გაეგზავნება'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
