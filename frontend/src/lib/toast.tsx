import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ToastKind = 'ok' | 'info' | 'warn'

interface Toast {
  kind: ToastKind
  title: string
  desc?: string
}

interface ActiveToast extends Toast {
  id: number
}

/** Auto-dismiss delay — matches the progress bar animation in index.css. */
const TOAST_MS = 4200

/** One action can report more than one outcome (saved + view reset); older ones
 *  fall off the top rather than piling into a wall. */
const MAX_VISIBLE = 3

let seq = 0

const KIND_STYLE: Record<ToastKind, { bg: string; fg: string; icon: string }> = {
  ok: { bg: 'var(--color-ok-soft)', fg: 'var(--color-ok)', icon: '✓' },
  info: { bg: 'var(--color-info-soft)', fg: 'var(--color-info)', icon: 'i' },
  warn: { bg: 'var(--color-warn-soft)', fg: 'var(--color-warn)', icon: '!' },
}

const ToastContext = createContext<((t: Toast) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (t: Toast) => {
      const id = ++seq
      setToasts((prev) => [...prev, { ...t, id }].slice(-MAX_VISIBLE))
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_MS),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      {toasts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed right-3.5 top-17 z-400 flex w-[min(380px,calc(100vw-28px))] flex-col gap-2"
        >
          {toasts.map((toast) => {
            const style = KIND_STYLE[toast.kind]
            return (
              <div
                key={toast.id}
                className="pointer-events-auto animate-toast-in overflow-hidden rounded-[13px] border border-line bg-card shadow-[0_18px_50px_rgba(14,20,26,0.22)]"
              >
                <div className="flex items-start gap-3 px-3.5 py-3.25">
                  <span
                    className="grid h-8 w-8 flex-none place-items-center rounded-[9px] text-[15px] font-extrabold"
                    style={{ background: style.bg, color: style.fg }}
                  >
                    {style.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold leading-[1.4]">{toast.title}</span>
                    {toast.desc && (
                      <span className="mt-0.5 block text-xs leading-[1.5] text-mut">{toast.desc}</span>
                    )}
                  </span>
                  <button
                    onClick={() => dismiss(toast.id)}
                    aria-label="დახურვა"
                    className="cursor-pointer p-0.5 text-mut-2 hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="h-0.75 animate-toast-bar rounded-full" style={{ background: style.fg }} />
              </div>
            )
          })}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
