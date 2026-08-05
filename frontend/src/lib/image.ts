// Field photos come off a phone camera at 8–12 MP, which is far more than a
// defect record needs and slow to push through IndexedDB. Every picked file is
// decoded, rotated per its EXIF orientation, scaled to fit MAX_EDGE and
// re-encoded as JPEG before it is stored.
//
// Every step degrades gracefully: a format the browser cannot decode (HEIC on
// some desktops) is kept as-is rather than rejected, so the inspector never
// loses a photo to a codec.

import type { Annotation } from './annotate'

const MAX_EDGE = 1600
const QUALITY = 0.82

export type PhotoSource = 'camera' | 'upload'

export interface PreparedPhoto {
  id: string
  name: string
  /** What gets stored and shown — annotations already burned in, if any. */
  blob: Blob
  /** Stored dimensions — used to reserve layout space before the blob loads. */
  w: number
  h: number
  source: PhotoSource
  /** ISO capture time. The camera's own timestamp is not readable here, so this
   *  is when the inspector added it — which is the moment the record is made. */
  at: string
  /** Marks drawn on the photo, in normalized coordinates. */
  annotations?: Annotation[]
  /** The capture before any markup, kept only while the defect is being filed
   *  so reopening the editor redraws over clean pixels instead of a flatten. */
  original?: Blob
}

function id(): string {
  const rand =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `PH-${rand.replace(/-/g, '').slice(0, 10)}`
}

/** ImageBitmap where available (it honours EXIF), otherwise a decoded <img>. */
export async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      try {
        return await createImageBitmap(file)
      } catch {
        /* unsupported codec — fall through to <img> */
      }
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
}

/**
 * The bytes behind a blob.
 *
 * Photos are persisted as ArrayBuffers rather than Blobs: WebKit's IndexedDB
 * mishandles a stored Blob — the transaction either errors or never settles at
 * all, which on iOS turns a save into a spinner that never stops.
 */
export function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('photo read failed'))
    reader.readAsArrayBuffer(blob)
  })
}

export async function preparePhoto(file: File, source: PhotoSource): Promise<PreparedPhoto> {
  const base = { id: id(), name: file.name || 'photo.jpg', source, at: new Date().toISOString() }
  const src = await decode(file)
  if (!src) return { ...base, blob: file, w: 0, h: 0 }

  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh))
  const w = Math.round(sw * scale)
  const h = Math.round(sh * scale)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ...base, blob: file, w: sw, h: sh }
    ctx.drawImage(src, 0, 0, w, h)
    const blob = await toBlob(canvas)
    // Re-encoding a small PNG/WebP can come out larger — keep whichever is smaller.
    if (!blob) return { ...base, blob: file, w: sw, h: sh }
    return blob.size < file.size
      ? { ...base, blob, w, h }
      : { ...base, blob: file, w: sw, h: sh }
  } finally {
    if ('close' in src) src.close()
  }
}
