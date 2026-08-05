import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, ChevronLeft, Circle, MoveUpRight, Pencil, Trash2, Type, Undo2 } from 'lucide-react'
import {
  ANNOTATION_COLORS,
  drawAnnotations,
  flattenAnnotations,
  type Annotation,
  type AnnotationTool,
  type Point,
} from '@/lib/annotate'
import { decode, type PreparedPhoto } from '@/lib/image'
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TOOLS: { id: AnnotationTool; label: string; icon: typeof Circle }[] = [
  { id: 'arrow', label: 'ისარი', icon: MoveUpRight },
  { id: 'circle', label: 'წრე', icon: Circle },
  { id: 'pen', label: 'მოხაზვა', icon: Pencil },
  { id: 'text', label: 'ტექსტი', icon: Type },
]

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Long-edge cap for the editing surface. The save step re-renders the same
 *  shapes onto the full-resolution photo, so this costs no output quality. */
const MAX_SURFACE = 1200

/**
 * Marks up one freshly captured photo before it is attached to a defect.
 *
 * The image and the strokes share a single canvas: pointer coordinates map
 * straight onto it, and `drawAnnotations` is the same renderer that burns the
 * marks into the full-resolution JPEG on save — so the preview is the result,
 * not an approximation of it.
 *
 * Renders *into* the filing dialog rather than opening one of its own. Stacking
 * a second Radix layer over the form left it with `pointer-events: none` once
 * this one unmounted, which killed the form's own buttons on touch devices —
 * the only place the editor opens by itself.
 */
export function PhotoAnnotator({
  photo,
  onCancel,
  onSave,
}: {
  photo: PreparedPhoto
  onCancel: () => void
  /** Handed the flattened JPEG plus the shapes that produced it. */
  onSave: (next: { blob: Blob; annotations: Annotation[] }) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<ImageBitmap | HTMLImageElement | null>(null)

  const [tool, setTool] = useState<AnnotationTool>('arrow')
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0])
  // Annotations are re-editable: reopening a marked photo restores the shapes
  // and redraws them over the untouched original.
  const [shapes, setShapes] = useState<Annotation[]>(photo.annotations ?? [])
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [pendingText, setPendingText] = useState<Point | null>(null)
  const [textValue, setTextValue] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const ready = status === 'ready'

  // Always draw over the capture, never over a previous flatten — re-editing
  // would otherwise stack JPEG artifacts and bake in undone strokes.
  const source = photo.original ?? photo.blob

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    drawAnnotations(ctx, draft ? [...shapes, draft] : shapes, canvas.width, canvas.height)
  }, [shapes, draft])

  useEffect(() => {
    let alive = true
    let bitmap: ImageBitmap | HTMLImageElement | null = null
    void decode(source).then((img) => {
      if (!alive) {
        if (img && 'close' in img) img.close()
        return
      }
      bitmap = img
      imgRef.current = img
      const canvas = canvasRef.current
      if (img && canvas) {
        const nw = 'naturalWidth' in img ? img.naturalWidth : img.width
        const nh = 'naturalHeight' in img ? img.naturalHeight : img.height
        // The canvas carries the photo's own aspect ratio as its intrinsic size,
        // so CSS max-width/max-height scale it exactly like an <img> — no resize
        // observer, no letterboxing, no distortion on rotate. Capped because a
        // full 1600px surface is redrawn on every pointer move.
        const scale = Math.min(1, MAX_SURFACE / Math.max(nw || 1, nh || 1))
        canvas.width = Math.max(1, Math.round((nw || 4) * scale))
        canvas.height = Math.max(1, Math.round((nh || 3) * scale))
      }
      setStatus(img ? 'ready' : 'error')
    })
    return () => {
      alive = false
      imgRef.current = null
      if (bitmap && 'close' in bitmap) bitmap.close()
    }
  }, [source])

  useEffect(() => {
    if (ready) redraw()
  }, [ready, redraw])

  const at = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
  }

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!ready) return
    const p = at(e)
    if (tool === 'text') {
      setPendingText(p)
      setTextValue('')
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft({ tool, color, points: tool === 'pen' ? [p] : [p, p] })
  }

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!draft) return
    const p = at(e)
    setDraft((d) =>
      !d ? d : { ...d, points: d.tool === 'pen' ? [...d.points, p] : [d.points[0]!, p] },
    )
  }

  const onUp = () => {
    if (!draft) return
    const [a, b] = draft.points
    // Discard an accidental tap that produced no visible shape.
    const moved =
      draft.tool === 'pen'
        ? draft.points.length > 2
        : !!a && !!b && Math.hypot(b.x - a.x, b.y - a.y) > 0.02
    if (moved) setShapes((prev) => [...prev, draft])
    setDraft(null)
  }

  const commitText = () => {
    const text = textValue.trim()
    if (pendingText && text) {
      setShapes((prev) => [...prev, { tool: 'text', color, points: [pendingText], text }])
    }
    setPendingText(null)
    setTextValue('')
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      onSave({ blob: await flattenAnnotations(source, shapes), annotations: shapes })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <button
          onClick={onCancel}
          title="უკან — ხარვეზის ფორმა"
          className="grid h-7.5 w-7.5 flex-none cursor-pointer place-items-center rounded-lg bg-soft-2 text-mut-3 hover:bg-line"
        >
          <ChevronLeft className="h-3.75 w-3.75" />
        </button>
        <DialogTitle>ფოტოს მონიშვნა</DialogTitle>
        <span className="text-[11px] text-mut-2">
          {photo.source === 'camera' ? 'ველზე გადაღებული' : 'ატვირთული ფაილი'}
        </span>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft px-5 py-2.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTool(t.id)}
            aria-pressed={tool === t.id}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border px-2.5 py-1.5 text-[11.5px] font-semibold',
              tool === t.id
                ? 'border-chip-a bg-chip-a text-chip-a-fg'
                : 'border-line-2 bg-card text-mut-3 hover:bg-soft',
            )}
          >
            <t.icon className="h-3.25 w-3.25" />
            {t.label}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-line" />

        {ANNOTATION_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`ფერი ${c}`}
            aria-pressed={color === c}
            className={cn(
              'h-6 w-6 cursor-pointer rounded-full border-2 transition-transform',
              color === c ? 'scale-110 border-brand' : 'border-line-2',
            )}
            style={{ background: c }}
          />
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShapes((prev) => prev.slice(0, -1))}
            disabled={!shapes.length}
            title="უკან"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-line-2 bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-mut-3 hover:bg-soft disabled:opacity-40"
          >
            <Undo2 className="h-3.25 w-3.25" /> უკან
          </button>
          <button
            type="button"
            onClick={() => setShapes([])}
            disabled={!shapes.length}
            title="ყველას წაშლა"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-line-2 bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-mut-3 hover:bg-soft disabled:opacity-40"
          >
            <Trash2 className="h-3.25 w-3.25" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center overflow-auto bg-soft-3 p-3">
        <div className="relative inline-block leading-none">
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            // `touch-none` matters: without it the browser claims the drag for
            // panning and the stroke never reaches the canvas on a phone.
            className={cn(
              'max-h-[52dvh] max-w-full touch-none rounded-[10px] bg-soft-2',
              ready ? 'cursor-crosshair' : 'opacity-60',
            )}
          />
          {pendingText && (
            <div
              className="absolute z-2 -translate-y-1/2"
              style={{ left: `${pendingText.x * 100}%`, top: `${pendingText.y * 100}%` }}
            >
              <input
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText()
                  if (e.key === 'Escape') setPendingText(null)
                }}
                placeholder="ტექსტი…"
                className="w-40 rounded-[7px] border border-brand bg-card px-2 py-1 text-xs shadow-lg"
              />
            </div>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-mut-2">
          {status === 'loading'
            ? 'ფოტო იხსნება…'
            : status === 'error'
              ? 'ამ ფაილის გახსნა ბრაუზერმა ვერ შეძლო — ფოტო მაინც მიება ხარვეზს'
              : tool === 'text'
                ? 'შეეხეთ ფოტოს წარწერის დასამატებლად'
                : 'დახაზეთ ფოტოზე — ანოტაცია შეინახება სურათში'}
        </p>
      </div>

      <DialogFooter className="flex-col-reverse sm:flex-row">
        <span className="mr-auto hidden text-[11px] text-mut-2 sm:block">
          {shapes.length ? `${shapes.length} ანოტაცია` : 'ანოტაცია არ არის'}
        </span>
        <Button variant="outline" className="w-full sm:w-auto" onClick={onCancel} disabled={saving}>
          გაუქმება
        </Button>
        <Button className="w-full sm:w-auto" onClick={save} disabled={!ready || saving}>
          <Check className="h-4 w-4" /> {saving ? 'ინახება…' : 'შენახვა'}
        </Button>
      </DialogFooter>
    </>
  )
}
