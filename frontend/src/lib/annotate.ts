// Photo markup — the arrows, circles and labels an inspector draws on a defect
// photo before filing it.
//
// Shapes are stored in normalized 0..1 coordinates, never pixels: the inspector
// draws on a ~320px phone preview and the same shape has to land in exactly the
// same place on the 1600px stored JPEG. One `drawAnnotations` renders both, so
// what the canvas shows is what the saved file gets.

import { decode } from './image'

export type AnnotationTool = 'arrow' | 'circle' | 'pen' | 'text'

export interface Point {
  x: number
  y: number
}

export interface Annotation {
  tool: AnnotationTool
  color: string
  /** arrow/circle: [from, to] · pen: the traced path · text: [anchor]. */
  points: Point[]
  text?: string
}

/** Brand orange first — it reads on concrete, which is most of what gets shot.
 *  White and ink cover the dark and blown-out corners it disappears into. */
export const ANNOTATION_COLORS = ['#FF4D00', '#FFFFFF', '#16191D'] as const

/** Ink on white, white on everything else. */
const contrast = (color: string) => (color.toUpperCase() === '#FFFFFF' ? '#16191D' : '#FFFFFF')

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Paints `list` over a `w`×`h` context. Stroke weight and type size scale with
 * the surface, so a mark drawn on the preview keeps its visual weight when the
 * same shapes are flattened onto the full-resolution photo.
 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  list: Annotation[],
  w: number,
  h: number,
) {
  const unit = Math.max(2, Math.min(w, h) / 170)
  const px = (p: Point): [number, number] => [p.x * w, p.y * h]

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const a of list) {
    if (!a.points.length) continue
    ctx.strokeStyle = a.color
    ctx.fillStyle = a.color
    ctx.lineWidth = unit
    // A dark halo keeps a light stroke legible over a bright, busy photo.
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = unit * 1.2

    if (a.tool === 'arrow') {
      const [x0, y0] = px(a.points[0]!)
      const [x1, y1] = px(a.points[1] ?? a.points[0]!)
      const ang = Math.atan2(y1 - y0, x1 - x0)
      const head = unit * 4.5
      // Stop the shaft inside the head so the tip stays sharp.
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1 - Math.cos(ang) * head * 0.7, y1 - Math.sin(ang) * head * 0.7)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1 - Math.cos(ang - 0.42) * head, y1 - Math.sin(ang - 0.42) * head)
      ctx.lineTo(x1 - Math.cos(ang + 0.42) * head, y1 - Math.sin(ang + 0.42) * head)
      ctx.closePath()
      ctx.fill()
    } else if (a.tool === 'circle') {
      const [x0, y0] = px(a.points[0]!)
      const [x1, y1] = px(a.points[1] ?? a.points[0]!)
      ctx.beginPath()
      ctx.ellipse(
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        Math.max(Math.abs(x1 - x0) / 2, unit),
        Math.max(Math.abs(y1 - y0) / 2, unit),
        0,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
    } else if (a.tool === 'pen') {
      ctx.beginPath()
      a.points.forEach((p, i) => {
        const [x, y] = px(p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      // A single tap still leaves a visible dot.
      if (a.points.length === 1) {
        const [x, y] = px(a.points[0]!)
        ctx.arc(x, y, unit / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.stroke()
    } else if (a.tool === 'text' && a.text) {
      const size = Math.max(11, Math.min(w, h) / 24)
      ctx.font = `700 ${size}px "Noto Sans Georgian", "Archivo", system-ui, sans-serif`
      ctx.textBaseline = 'middle'
      const padX = size * 0.5
      const padY = size * 0.34
      const tw = ctx.measureText(a.text).width
      const bw = tw + padX * 2
      const bh = size + padY * 2
      const [ax, ay] = px(a.points[0]!)
      // Keep the label on-canvas when it is dropped near an edge.
      const x = Math.min(Math.max(ax, 2), Math.max(w - bw - 2, 2))
      const y = Math.min(Math.max(ay - bh / 2, 2), Math.max(h - bh - 2, 2))
      roundRect(ctx, x, y, bw, bh, size * 0.32)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = contrast(a.color)
      ctx.fillText(a.text, x + padX, y + bh / 2)
    }
  }

  ctx.restore()
}

/**
 * Burns `list` into `source` at its stored resolution and returns a new JPEG.
 *
 * The flattened file is what gets saved, shown and printed, so the markup can
 * never drift from the evidence it explains. Returns `source` untouched when
 * there is nothing to draw or the browser cannot decode it.
 */
export async function flattenAnnotations(
  source: Blob,
  list: Annotation[],
  quality = 0.85,
): Promise<Blob> {
  if (!list.length) return source
  const img = await decode(source)
  if (!img) return source
  try {
    const w = 'naturalWidth' in img ? img.naturalWidth : img.width
    const h = 'naturalHeight' in img ? img.naturalHeight : img.height
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return source
    ctx.drawImage(img, 0, 0, w, h)
    drawAnnotations(ctx, list, w, h)
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
    return out ?? source
  } finally {
    if ('close' in img) img.close()
  }
}
