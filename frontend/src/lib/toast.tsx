import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ToastKind = 'ok' | 'info' | 'warn'

interface Toast {
  kind: ToastKind
  title: string
  desc?: string
}

/** Auto-dismiss delay — matches the progress bar animation in index.css. */
const TOAST_MS = 4200

const KIND_STYLE: Record<ToastKind, { bg: string; fg: string; icon: string }> = {
  ok: { bg: 'var(--color-ok-soft)', fg: 'var(--color-ok)', icon: '✓' },
  info: { bg: 'var(--color-info-soft)', fg: 'var(--color-info)', icon: 'i' },
  warn: { bg: 'var(--color-warn-soft)', fg: 'var(--color-warn)', icon: '!' },
}

const ToastContext = createContext<((t: Toast) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const push = useCallback((t: Toast) => {
    clearTimeout(timer.current)
    setToast(t)
    timer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const style = toast ? KIND_STYLE[toast.kind] : null

  return (
    <ToastContext.Provider value={push}>
      {children}
      {toast && style && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-3.5 top-17 z-400 w-[min(380px,calc(100vw-28px))] animate-toast-in"
        >
          <div className="overflow-hidden rounded-[13px] border border-line bg-card shadow-[0_18px_50px_rgba(14,20,26,0.22)]">
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
                onClick={() => setToast(null)}
                aria-label="დახურვა"
                className="cursor-pointer p-0.5 text-mut-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              className="h-0.75 animate-toast-bar rounded-full"
              style={{ background: style.fg }}
            />
          </div>
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
