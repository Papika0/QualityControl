import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, ChevronLeft, ImageIcon, Loader2, Pencil, Upload, Wand2, X } from 'lucide-react'
import { apartmentsQuery } from '@/api/queries'
import { useCreateDefect } from '@/api/mutations'
import { DEFECT_DUE_DAYS, addDays } from '@/api/client'
import { CATS, PEOPLE, PRI_LABEL, SUBS, TODAY, groupsFor, recoFor, type Defect, type Priority } from '@/data/domain'
import { useSession } from '@/lib/session'
import { useToast } from '@/lib/toast'
import { useBlobUrls } from '@/lib/blob-url'
import type { Annotation } from '@/lib/annotate'
import { preparePhoto, type PhotoSource, type PreparedPhoto } from '@/lib/image'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PhotoAnnotator } from '@/components/photo-annotator'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LABEL = 'mb-1.25 block text-[10px] font-semibold uppercase tracking-[0.1em] text-mut'
const CONTROL = 'w-full rounded-lg border border-line-2 bg-card px-2.75 py-2.25 text-[13px]'

// The prototype's room list for a defect — the domain ROOMS plus the corridor,
// which only ever appears as a defect location, never as a generated room.
const ROOM_OPTIONS = ['სველი წერტილი', 'სამზარეულო', 'მისაღები', 'საძინებელი', 'ჰოლი', 'დერეფანი']

const MAX_PHOTOS = 8

/** Where the assignment notice goes out. Push + Email are the standing default;
 *  SMS is opt-in because it is billed per message. */
const CHANNELS = [
  { id: 'push', label: 'Push' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
] as const

type ChannelId = (typeof CHANNELS)[number]['id']

/**
 * True on phones and tablets. A coarse pointer is the signal that `capture` will
 * actually open a camera — on a desktop the attribute is ignored and the button
 * would just be a second, identical file picker.
 */
function useHasCamera(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const sync = () => setCoarse(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return coarse
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
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
  const [cat, setCat] = useState<string>(CATS[0]!)
  // '' is the "ჯგუფები" placeholder — a filing may stop at the category level.
  const [group, setGroup] = useState('')
  const [floor, setFloor] = useState('12')
  const [apt, setApt] = useState('1204')
  const [room, setRoom] = useState<string>(ROOM_OPTIONS[0]!)
  const [pri, setPri] = useState<Priority>('high')
  const [sub, setSub] = useState<string>(SUBS[0]!)
  const [who, setWho] = useState<string>(PEOPLE[1]!)
  const [due, setDue] = useState(addDays(TODAY, DEFECT_DUE_DAYS))
  const [reco, setReco] = useState<string | null>(null)
  const [channels, setChannels] = useState<ChannelId[]>(['push', 'email'])
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [preparing, setPreparing] = useState(0)
  const [dropping, setDropping] = useState(false)
  /** Id of the photo open in the markup editor. */
  const [marking, setMarking] = useState<string | null>(null)
  const hasCamera = useHasCamera()
  const previews = useBlobUrls(photos)
  const dropDepth = useRef(0)
  const descRef = useRef<HTMLTextAreaElement>(null)

  const toggleChannel = (id: ChannelId) =>
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))

  const channelLabels = CHANNELS.filter((c) => channels.includes(c.id)).map((c) => c.label)

  const addFiles = async (files: FileList | File[] | null, source: PhotoSource) => {
    const picked = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!picked.length) return
    const room = MAX_PHOTOS - photos.length
    if (room <= 0) {
      toast({ kind: 'warn', title: `მაქსიმუმ ${MAX_PHOTOS} ფოტო`, desc: 'წაშალეთ ერთი, რომ ახალი დაამატოთ' })
      return
    }
    const batch = picked.slice(0, room)
    setPreparing((n) => n + batch.length)
    try {
      const prepared = await Promise.all(batch.map((f) => preparePhoto(f, source)))
      setPhotos((prev) => [...prev, ...prepared])
      // Marking up a shot is the point of taking it on site, so a single camera
      // capture goes straight into the editor. A multi-file pick does not —
      // that would trap the inspector in a queue of dialogs.
      if (source === 'camera' && prepared.length === 1) setMarking(prepared[0]!.id)
      if (picked.length > room) {
        toast({ kind: 'warn', title: `დაემატა ${room} ფოტო`, desc: `ლიმიტი — ${MAX_PHOTOS} ფოტო ხარვეზზე` })
      }
    } catch {
      toast({ kind: 'warn', title: 'ფოტოს დამუშავება ვერ მოხერხდა', desc: 'სცადეთ სხვა ფაილი' })
    } finally {
      setPreparing((n) => n - batch.length)
    }
  }

  /** Resets the input so re-picking the same file still fires a change event. */
  const pick = (source: PhotoSource) => (e: ChangeEvent<HTMLInputElement>) => {
    void addFiles(e.target.files, source)
    e.target.value = ''
  }

  const removePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id))

  /** Replaces a photo with its annotated flatten, keeping the clean capture so
   *  reopening the editor starts from the original pixels. */
  const applyMarkup = (id: string, next: { blob: Blob; annotations: Annotation[] }) =>
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, blob: next.blob, annotations: next.annotations, original: p.original ?? p.blob }
          : p,
      ),
    )

  const marked = photos.find((p) => p.id === marking) ?? null

  // A file dropped anywhere but the tile would otherwise navigate the browser to
  // it, throwing away a half-filled form.
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  const floors = useMemo(
    () => [...new Set((apts ?? []).map((a) => a.floor))].sort((a, b) => b - a),
    [apts],
  )
  const aptsOnFloor = useMemo(
    () => (apts ?? []).filter((a) => a.floor === Number(floor)),
    [apts, floor],
  )

  const desc = reco ?? recoFor(cat)

  const groups = groupsFor(cat)

  // The recommendation runs to four or five lines on a phone and changes with
  // the category, so the box grows to its text instead of hiding the tail behind
  // an inner scroll. It never shrinks below four lines — a box that resized on
  // every category change read as jumpy.
  useEffect(() => {
    const el = descRef.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
    }
    fit()
    // The Georgian webfont swaps in after mount and reflows the text taller than
    // this first measurement — remeasure once it has landed.
    void document.fonts?.ready.then(fit).catch(() => {})
    // Rotating the phone changes the width, and with it the line count. Width is
    // the only trigger: reacting to height would loop against `fit` itself.
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
    // `marking` is a dependency because the markup editor replaces the form:
    // coming back mounts a fresh textarea that has to be measured again.
  }, [desc, marking])

  const submit = () => {
    if (create.isPending || preparing > 0) return
    create.mutate(
      // A cleared date field falls back to the standard window in the client.
      { apt, room, cat, group: group || undefined, pri, sub, who, due, desc: desc.trim(), photos },
      {
        onSuccess: (defect) => {
          onCreated?.(defect)
          onClose()
          const sent = channelLabels.length
            ? `${channelLabels.join(' + ')} გაეგზავნა შემსრულებელს და PM-ს`
            : 'შეტყობინება არ გაგზავნილა'
          toast({
            kind: 'ok',
            title: `${defect.id} დაფიქსირდა`,
            desc: photos.length ? `${photos.length} ფოტო შეინახა · ${sent}` : sent,
          })
        },
        // A failed write used to do nothing at all on screen — the inspector had
        // no way to tell a full disk from a dead button. The cause goes to the
        // console; the toast stays in the language of the person on site.
        onError: (err) => {
          console.error('[qc] defect save failed', err)
          toast({
            kind: 'warn',
            title: 'ხარვეზი ვერ შეინახა',
            desc: 'მონაცემები ვერ ჩაიწერა მოწყობილობაზე — სცადეთ ხელახლა',
          })
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* One dialog, two faces: the markup editor replaces the form in place.
          A second nested <Dialog> left this one non-interactive after it closed. */}
      <DialogContent
        className={marked ? 'max-w-4xl' : 'max-w-170'}
        showClose={!marked}
        onEscapeKeyDown={(e) => {
          // Escape backs out of markup; it must not discard the half-filled form.
          if (marked) {
            e.preventDefault()
            setMarking(null)
          }
        }}
      >
        {marked ? (
          <PhotoAnnotator
            key={marked.id}
            photo={marked}
            onCancel={() => setMarking(null)}
            onSave={(next) => {
              applyMarkup(marked.id, next)
              setMarking(null)
              if (next.annotations.length) {
                toast({
                  kind: 'ok',
                  title: 'ანოტაცია შეინახა',
                  desc: `${next.annotations.length} მონიშვნა · ფოტო მიება ხარვეზს`,
                })
              }
            }}
          />
        ) : (
          <>
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
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] [&>*]:min-w-0 gap-3.25">
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
              </div>

              {/* The taxonomy pair gets a row of its own, split in half. Inside
                  the auto-fit grid above, these two are wider than a 180px column
                  and a full-width ჯგუფები forced a row break that stranded the
                  category beside two empty columns. Half is the widest the
                  category ever needs — the longest ჯგუფი label is past any width
                  this dialog can offer, so the select's title carries the rest. */}
              <div className="mt-3.25 grid gap-3.25 sm:grid-cols-2">
                <Field label="პრობლემის კატეგორია" className="min-w-0">
                  <select
                    className={`${CONTROL} cursor-pointer`}
                    value={cat}
                    // The longest category clears the control by two pixels — a
                    // hair's breadth in another font, so hover carries it too.
                    title={cat}
                    onChange={(e) => {
                      setCat(e.target.value)
                      // The groups belong to the old category — keeping one would
                      // file the defect against a work item in a different trade.
                      setGroup('')
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

                {/* Only the categories with a second level get this field —
                    პარკინგი, აივანი and the rest carry no ჯგუფები at all, and an
                    empty select reads as a broken one. */}
                {groups.length > 0 && (
                  <Field label="ჯგუფები" className="min-w-0">
                    <select
                      className={`${CONTROL} cursor-pointer`}
                      value={group}
                      title={group || undefined}
                      onChange={(e) => setGroup(e.target.value)}
                    >
                      <option value="">ჯგუფები</option>
                      {groups.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              <div className="mt-3.25 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] [&>*]:min-w-0 gap-3.25">
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
                  {/* Starts on the standard window and stays editable — some
                      defects block a handover and cannot wait two weeks. */}
                  <input
                    type="date"
                    className={`${CONTROL} cursor-pointer`}
                    value={due}
                    min={TODAY}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </Field>

                <Field label="შეტყობინება">
                  <div className="flex flex-wrap gap-1.5 py-1.75">
                    {CHANNELS.map((c) => {
                      const on = channels.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleChannel(c.id)}
                          className={cn(
                            'cursor-pointer rounded-full border px-2.75 py-1 text-[10.5px] transition-colors',
                            on
                              ? 'border-brand-ring bg-brand-soft font-bold text-brand-dark'
                              : 'border-line-2 bg-card font-semibold text-mut-2 hover:border-brand-ring hover:text-mut-3',
                          )}
                        >
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              </div>

              <div className="pt-1.5">
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <label htmlFor="defect-desc" className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mut">
                    გამოსასწორებელი ღონისძიება
                  </label>
                  <span className="inline-flex items-center gap-1.25 rounded-full border border-note-line bg-note-bg px-2 py-0.5 text-[10px] font-semibold text-note-label">
                    <Wand2 className="h-2.75 w-2.75" />
                    ავტომატურად შევსებული კატეგორიის მიხედვით
                  </span>
                </div>
                <textarea
                  id="defect-desc"
                  ref={descRef}
                  rows={4}
                  className="block min-h-26 w-full resize-none overflow-hidden rounded-[10px] border border-note-line bg-note-field px-3.25 py-2.75 text-[12.5px] leading-[1.6] text-note-ink"
                  value={desc}
                  onChange={(e) => setReco(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2.5 pt-2.5">
                <div className="flex min-w-55 flex-1 gap-2">
                  {/* Only a coarse pointer gets the camera tile — `capture` does
                      nothing on a desktop, where the plain picker is the default. */}
                  {hasCamera && (
                    <label className="flex flex-[1.2] cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-brand/55 bg-brand-soft/40 px-2.5 py-3.5 text-center text-xs font-bold text-brand-dark hover:border-brand hover:bg-brand-soft">
                      <Camera className="h-5 w-5" />
                      გადაღება — კამერა
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={pick('camera')}
                      />
                    </label>
                  )}
                  <label
                    onDragEnter={(e) => {
                      e.preventDefault()
                      dropDepth.current += 1
                      setDropping(true)
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={() => {
                      dropDepth.current -= 1
                      if (dropDepth.current <= 0) setDropping(false)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      dropDepth.current = 0
                      setDropping(false)
                      void addFiles(e.dataTransfer.files, 'upload')
                    }}
                    className={cn(
                      'flex flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed px-2.5 py-3.5 text-center text-xs font-semibold hover:border-brand hover:text-brand-dark',
                      dropping ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line-2 text-mut-2',
                    )}
                  >
                    {hasCamera ? <ImageIcon className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                    {hasCamera ? 'გალერეიდან' : 'ატვირთვა — ან ჩააგდეთ ფაილი'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={pick('upload')}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      className="group relative h-16.5 w-16.5 overflow-hidden rounded-[10px] bg-soft-3"
                    >
                      {/* The tile itself opens the markup editor — on a phone that is
                          the whole target, not a 18px pencil. */}
                      <button
                        type="button"
                        title="მონიშვნა — ისარი, წრე, ტექსტი"
                        onClick={() => setMarking(p.id)}
                        className="block h-full w-full cursor-pointer"
                      >
                        {previews[p.id] && (
                          <img src={previews[p.id]} alt={p.name} className="h-full w-full object-cover" />
                        )}
                        <span
                          className={cn(
                            'absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-0.5 text-[8px] font-bold text-white transition-opacity',
                            p.annotations?.length ? 'bg-brand' : 'bg-ink/85',
                            hasCamera ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                          )}
                        >
                          <Pencil className="h-2 w-2" />
                          {p.annotations?.length ? `${p.annotations.length} ანოტაცია` : 'მონიშვნა'}
                        </span>
                      </button>
                      <button
                        type="button"
                        title="წაშლა"
                        onClick={() => removePhoto(p.id)}
                        className={cn(
                          'absolute right-1 top-1 grid h-4.5 w-4.5 cursor-pointer place-items-center rounded-full bg-ink/85 text-white transition-opacity focus-visible:opacity-100',
                          // Touch devices have no hover — the control has to stay put.
                          hasCamera ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        )}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                  {Array.from({ length: preparing }, (_, i) => (
                    <div
                      key={`busy-${i}`}
                      className="grid h-16.5 w-16.5 place-items-center rounded-[10px] bg-soft-2 text-mut-2"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ))}
                </div>
              </div>
            </DialogBody>

            {/* Full-width stacked buttons on a phone: side by side, the long primary
                label pushes the pair past the dialog's width. */}
            <DialogFooter className="flex-col-reverse sm:flex-row">
              <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>
                გაუქმება
              </Button>
              <Button className="w-full sm:w-auto" onClick={submit} disabled={create.isPending || preparing > 0}>
                {create.isPending ? 'ინახება…' : preparing > 0 ? 'ფოტო მუშავდება…' : 'დაფიქსირება და გაგზავნა'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
