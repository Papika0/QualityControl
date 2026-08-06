import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCircle2, ChevronLeft, CornerUpLeft, FileDown, ImageOff, Send, Wand2 } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAddDefectComment, useSetDefectStatus } from '@/api/mutations'
import { defectCommentsQuery, defectPhotosQuery } from '@/api/queries'
import type { Photo } from '@/api/client'
import { useSession } from '@/lib/session'
import { useToast } from '@/lib/toast'
import { useBlobUrls } from '@/lib/blob-url'
import { exportReport } from '@/lib/pdf'
import {
  DEFECT_FLOW, PRI_LABEL, TODAY, nextDefectStatus, recoFor,
  type Defect, type DefectStatus,
} from '@/data/domain'
import { cn, formatStamp, initials } from '@/lib/utils'

const PHOTO_KIND: Record<Photo['kind'], string> = { before: 'BEFORE', after: 'AFTER' }

/** The four stages of the process strip, one per status in `DEFECT_FLOW`. */
const TIMELINE_STEPS: { st: DefectStatus; t: string }[] = [
  { st: 'ღია', t: 'შეიქმნა ველზე' },
  { st: 'მიმდინარე', t: 'მიენიჭა შემსრულებელს' },
  { st: 'შემოწმებაზე', t: 'გამოსწორება / After ფოტო' },
  { st: 'დახურული', t: 'მიღება და დახურვა' },
]

/**
 * The defect's own process strip. Every stamp comes from `history`, written
 * when the status actually changed — a stage the defect has not reached yet
 * reads as pending rather than borrowing a date from somewhere else.
 */
function timeline(d: Defect): { t: string; d: string }[] {
  const reached = DEFECT_FLOW.indexOf(d.st)
  // Reopening re-enters a status, so the *last* matching entry is the true one.
  const entries = [...(d.history ?? [])].reverse()
  return TIMELINE_STEPS.map((step, i) => {
    const at = i <= reached ? entries.find((e) => e.st === step.st) : undefined
    if (!at) return { t: step.t, d: 'მოლოდინში' }
    // Handing the defect over is about the receiving contractor, not the sender.
    return { t: step.t, d: `${formatStamp(at.at)} · ${step.st === 'მიმდინარე' ? d.sub : at.who}` }
  })
}

/** Stable empty list — a fresh `[]` each render would re-run useBlobUrls forever. */
const NO_PHOTOS: Photo[] = []

function InfoTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('rounded-[9px] bg-soft px-3 py-2.25', className)}>
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
  const { project } = useSession()
  const [comment, setComment] = useState('')
  const [activePhoto, setActivePhoto] = useState(0)

  // Comments are hand-written only — nothing is seeded, so a defect nobody has
  // discussed yet shows an empty thread rather than invented chatter.
  const addComment = useAddDefectComment(defect?.id ?? '')
  const { data: comments = [] } = useQuery({
    ...defectCommentsQuery(project.id, defect?.id ?? ''),
    enabled: !!defect,
  })

  // Oldest first, so the newest sits below the fold once the thread scrolls —
  // open on it, and follow along as comments are posted.
  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments.length])

  // Photos filed with the defect. Seeded demo defects have none and keep the
  // designed placeholder; anything filed through the app shows its real shots.
  const { data } = useQuery({
    ...defectPhotosQuery(project.id, defect?.id ?? ''),
    enabled: !!defect,
  })
  const photos = data ?? NO_PHOTOS
  const urls = useBlobUrls(photos)
  const active = photos[Math.min(activePhoto, photos.length - 1)]

  if (!defect) return null

  const st = defect.st
  const doneIdx = DEFECT_FLOW.indexOf(st)
  const next = nextDefectStatus(st)
  const canReopen = st === 'შემოწმებაზე' || st === 'დახურული'

  // What the inspector filed. The form starts from the category's template, so
  // an untouched measure is the automatic one — an edited one is their words.
  const template = recoFor(defect.cat)
  const measure = defect.desc.trim() || template
  const autoMeasure = measure === template

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

  /** Single-defect report — the record sheet a PM forwards or files. */
  const exportPdf = () => {
    const late = defect.due < TODAY && defect.st !== 'დახურული'
    const how = exportReport({
      docTitle: `${defect.id}-ანგარიში`,
      title: `${defect.cat} — ${defect.room}`,
      subtitle: `${project.id} · ხარვეზის ანგარიში · ${defect.id}`,
      meta: [
        { label: 'სტატუსი', value: defect.st },
        { label: 'პრიორიტეტი', value: PRI_LABEL[defect.pri] },
        { label: 'ბინა', value: defect.apt },
        { label: 'ვადა', value: late ? `${defect.due} — ვადაგადაცილებული` : defect.due },
      ],
      blocks: [
        ...(defect.group ? [{ label: 'ჯგუფი', value: defect.group }] : []),
        { label: 'ობიექტი', value: `${project.name} — ${project.addr}` },
        { label: 'შემსრულებელი', value: defect.sub },
        { label: 'პასუხისმგებელი ინსპექტორი', value: defect.who },
        { label: 'გამოსასწორებელი ღონისძიება', value: measure },
        { label: 'პროცესი', value: timeline(defect).map((s) => `• ${s.t} — ${s.d}`).join('\n') },
        {
          label: 'კომენტარები',
          value: comments.length
            ? comments.map((c) => `${c.who} (${formatStamp(c.at)}): ${c.text}`).join('\n')
            : 'კომენტარი არ არის',
        },
        {
          label: 'ფოტოები',
          value: photos.length
            ? photos
                .map(
                  (p) =>
                    `• ${p.name} — ${formatStamp(p.at)}${p.annotations?.length ? ` · ${p.annotations.length} ანოტაცია` : ''}`,
                )
                .join('\n')
            : 'ფოტო არ არის მიბმული',
        },
      ],
      note: `${project.name} · ხარისხის კონტროლის პლატფორმა`,
    })
    toast({
      kind: 'ok',
      title: `PDF ანგარიში — ${defect.id}`,
      desc:
        how === 'window'
          ? 'ბეჭდვის ფანჯარაში აირჩიეთ „Save as PDF“'
          : 'ბრაუზერმა ახალი ფანჯარა დაბლოკა — ბეჭდვა გაიხსნა აქვე',
    })
  }

  const reopen = () =>
    setStatus.mutate(
      { id: defect.id, st: 'ღია' },
      {
        onSuccess: () =>
          toast({
            kind: 'warn',
            title: 'დაბრუნდა გამოსასწორებლად — სტატუსი: ღია',
            desc: 'მიზეზი ჩაიწერა ხარვეზის ისტორიაში, Push გაეგზავნა',
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
          {/* Photo column — only evidence actually filed with the defect. */}
          <div className="min-w-[min(320px,100%)] flex-[1.25]">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-soft-3">
              {active ? (
                <>
                  {urls[active.id] && (
                    <img
                      src={urls[active.id]}
                      alt={active.name}
                      className="h-full w-full object-contain"
                    />
                  )}
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-ink px-2.25 py-0.75 text-[10px] font-bold text-card">
                    {PHOTO_KIND[active.kind]} · {formatStamp(active.at)}
                  </span>
                  <span className="absolute bottom-2.5 right-2.5 rounded-[5px] bg-ink/80 px-1.75 py-0.5 font-mono text-[9px] text-card">
                    {active.source === 'camera' ? 'კამერა · ველზე გადაღებული' : 'ატვირთული ფაილი'}
                  </span>
                </>
              ) : (
                <div className="grid h-full place-items-center px-6 text-center">
                  <div>
                    <ImageOff className="mx-auto h-6 w-6 text-mut-2" />
                    <div className="mt-2 text-[12.5px] font-semibold text-mut-3">
                      ფოტო არ არის მიბმული
                    </div>
                    <div className="mt-0.5 text-[11px] text-mut-2">
                      ხარვეზის რეგისტრაციისას ატვირთული ფოტოები აქ გამოჩნდება.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {photos.length > 1 && (
              <div className="mt-2.5 flex gap-2">
                {photos.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePhoto(i)}
                    title={p.name}
                    className={cn(
                      'relative aspect-video max-w-28 flex-1 cursor-pointer overflow-hidden rounded-[9px] bg-soft-3',
                      i === activePhoto ? 'border-2 border-brand' : 'opacity-85 hover:opacity-100',
                    )}
                  >
                    {urls[p.id] && (
                      <img src={urls[p.id]} alt={p.name} className="h-full w-full object-cover" />
                    )}
                    <span className="absolute bottom-1.25 left-1.5 rounded-full bg-ink px-1.5 py-px text-[8.5px] font-bold text-card">
                      {PHOTO_KIND[p.kind]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail column */}
          <div className="min-w-[min(280px,100%)] flex-1">
            <div className="mb-3.25 grid grid-cols-2 gap-2.25">
              {/* The header carries the category; the ჯგუფი is the work item it
                  was actually filed against, and only some categories have one. */}
              {defect.group && (
                <InfoTile label="ჯგუფი" value={defect.group} className="col-span-2" />
              )}
              <InfoTile label="ბინა" value={defect.apt} />
              <InfoTile label="ვადა" value={defect.due} />
              <InfoTile label="ინსპექტორი" value={defect.who} />
              <InfoTile label="შემსრულებელი" value={defect.sub} />
            </div>

            <div className="mb-3.25 rounded-[11px] border border-note-line bg-note-bg px-3.5 py-3">
              <div className="mb-1.25 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] text-note-label">
                {autoMeasure && <Wand2 className="h-2.75 w-2.75 flex-none" />}
                გამოსასწორებელი ღონისძიება{autoMeasure && ' — ავტომატური'}
              </div>
              <div className="text-[12.5px] leading-[1.6] text-note-ink">{measure}</div>
            </div>

            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-mut-2">
              პროცესი
            </div>
            <div className="flex flex-col">
              {timeline(defect).map((s, i) => (
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
            {/* The thread scrolls inside its own box — a long discussion must
                not push the process strip and the composer out of the dialog. */}
            <div ref={threadRef} className="mb-2.5 max-h-56 overflow-y-auto overscroll-contain">
              {comments.length === 0 ? (
                <div className="rounded-[10px] bg-soft px-2.75 py-2 text-[11.5px] text-mut-2">
                  კომენტარი ჯერ არ არის — დაწერეთ პირველი.
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="mb-2.25 flex gap-2.25 last:mb-0">
                    <span className="grid h-6.5 w-6.5 flex-none place-items-center rounded-lg bg-soft-2 text-[10px] font-bold text-mut-3">
                      {initials(c.who)}
                    </span>
                    {/* min-w-0 lets the bubble shrink below its longest word;
                        without it a flex item sizes to that word and drags the
                        whole dialog sideways. break-words then wraps it. */}
                    <div className="min-w-0 flex-1 rounded-[10px] bg-soft px-2.75 py-2">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[11px] font-bold break-words">{c.who}</span>
                        <span className="text-[9.5px] text-mut-2">{formatStamp(c.at)}</span>
                      </div>
                      <div className="mt-0.5 text-xs leading-[1.5] break-words">{c.text}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const text = comment.trim()
                if (!text || addComment.isPending) return
                addComment.mutate(text, {
                  onSuccess: () => {
                    setComment('')
                    toast({
                      kind: 'info',
                      title: 'კომენტარი დაემატა',
                      desc: 'მონაწილეებს გაეგზავნა შეტყობინება',
                    })
                  },
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
                disabled={addComment.isPending}
                className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-[9px] bg-brand text-white shadow-[0_4px_12px_rgba(255,77,0,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </DialogBody>

        <DialogFooter className="flex-wrap justify-start gap-2.5">
          <Button
            variant="secondary"
            className="bg-ink text-card hover:bg-ink/85"
            onClick={advance}
            disabled={!next || setStatus.isPending}
          >
            {next ? (
              `სტატუსი → ${next}`
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> დახურულია
              </>
            )}
          </Button>
          {canReopen && (
            <Button
              variant="outline"
              className="border-danger/45 text-danger hover:bg-danger-soft"
              onClick={reopen}
              disabled={setStatus.isPending}
            >
              <CornerUpLeft className="h-3.5 w-3.5" /> დაბრუნება გამოსასწორებლად
            </Button>
          )}
          <Button variant="outline" onClick={exportPdf}>
            <FileDown className="h-3.5 w-3.5" /> PDF ანგარიში
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
