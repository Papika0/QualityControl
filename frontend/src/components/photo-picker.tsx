// Camera / gallery tiles plus the thumbnail strip, shared by everything that
// attaches images. The defect form keeps its own richer version — it also runs
// the markup editor — but the capture mechanics live here so a second caller
// does not have to re-derive the file-input quirks.

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, ImageIcon, Loader2, Upload, X } from 'lucide-react'
import { useBlobUrls } from '@/lib/blob-url'
import { preparePhoto, type PhotoSource, type PreparedPhoto } from '@/lib/image'
import { useToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * Whether to offer a camera tile. Only a coarse pointer — a phone or tablet —
 * will actually open a camera; on a desktop `capture` is ignored and the button
 * would just be a second, identical file picker.
 */
export function useHasCamera(): boolean {
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

export function PhotoPicker({
  photos,
  onChange,
  max,
  className,
}: {
  photos: PreparedPhoto[]
  onChange: (next: PreparedPhoto[]) => void
  max: number
  className?: string
}) {
  const toast = useToast()
  const hasCamera = useHasCamera()
  const previews = useBlobUrls(photos)
  const [preparing, setPreparing] = useState(0)
  const [dropping, setDropping] = useState(false)
  const dropDepth = useRef(0)

  // A file dropped anywhere but the tile would otherwise navigate the browser
  // to it, throwing away whatever the user had typed.
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  const addFiles = async (files: FileList | File[] | null, source: PhotoSource) => {
    const picked = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!picked.length) return
    const room = max - photos.length
    if (room <= 0) {
      toast({ kind: 'warn', title: `მაქსიმუმ ${max} ფოტო`, desc: 'წაშალეთ ერთი, რომ ახალი დაამატოთ' })
      return
    }
    const batch = picked.slice(0, room)
    setPreparing((n) => n + batch.length)
    try {
      const prepared = await Promise.all(batch.map((f) => preparePhoto(f, source)))
      onChange([...photos, ...prepared])
      if (picked.length > room) {
        toast({ kind: 'warn', title: `დაემატა ${room} ფოტო`, desc: `ლიმიტი — ${max} ფოტო` })
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

  return (
    <div className={cn('flex flex-wrap items-start gap-2', className)}>
      <div className="flex min-w-40 flex-1 gap-2">
        {hasCamera && (
          <label className="flex flex-[1.2] cursor-pointer flex-col items-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-brand/55 bg-brand-soft/40 px-2 py-2.5 text-center text-[11px] font-bold text-brand-dark hover:border-brand hover:bg-brand-soft">
            <Camera className="h-4 w-4" />
            კამერა
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick('camera')} />
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
            'flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-[10px] border-[1.5px] border-dashed px-2 py-2.5 text-center text-[11px] font-semibold hover:border-brand hover:text-brand-dark',
            dropping ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line-2 text-mut-2',
          )}
        >
          {hasCamera ? <ImageIcon className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          {hasCamera ? 'გალერეიდან' : 'ფოტოს დამატება'}
          <input type="file" accept="image/*" multiple className="hidden" onChange={pick('upload')} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="group relative h-14 w-14 overflow-hidden rounded-[10px] bg-soft-3">
            {previews[p.id] && <img src={previews[p.id]} alt={p.name} className="h-full w-full object-cover" />}
            <button
              type="button"
              title="წაშლა"
              onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
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
          <div key={`busy-${i}`} className="grid h-14 w-14 place-items-center rounded-[10px] bg-soft-2 text-mut-2">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ))}
      </div>
    </div>
  )
}
