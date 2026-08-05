import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'

interface Notification {
  color: string
  title: string
  desc: string
  ago: string
  /** Where clicking the row takes the user. */
  to: { path: '/qa'; defectId: string } | { path: '/apartments'; aptNo: string }
}

const NOTIFICATIONS: Notification[] = [
  {
    color: 'var(--color-tone-danger-solid)',
    title: 'ვადა გავიდა: QA-0903-021',
    desc: 'კაბელის შეცვლა · შპს ტექნო-ინსტალაცია',
    ago: '12 წთ',
    to: { path: '/qa', defectId: 'QA-0903-021' },
  },
  {
    color: 'var(--color-brand)',
    title: 'ახალი ხარვეზი: ბინა 1204',
    desc: 'Tiles · სველი წერტილი · მაღალი პრიორიტეტი',
    ago: '1 სთ',
    to: { path: '/qa', defectId: 'QA-1204-017' },
  },
  {
    color: 'var(--color-tone-info-solid)',
    title: 'ბინა 1204 — პროგრესი განახლდა',
    desc: 'Tile ეტაპი დასრულდა',
    ago: '3 სთ',
    to: { path: '/apartments', aptNo: '1204' },
  },
  {
    color: 'var(--color-tone-ok-solid)',
    title: 'ხარვეზი დაიხურა: QA-0611-017',
    desc: 'ი/მ ჯ. წიკლაური · QA ვიზუალური კონტროლი',
    ago: 'გუშინ',
    to: { path: '/qa', defectId: 'QA-0611-017' },
  },
]

export const NOTIFICATION_COUNT = NOTIFICATIONS.length

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  // Dismiss on outside click, matching the prototype's popover behaviour.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const open = (n: Notification) => {
    onClose()
    if (n.to.path === '/qa') navigate({ to: '/qa', search: { id: n.to.defectId } })
    else navigate({ to: '/apartments/$aptNo', params: { aptNo: n.to.aptNo } })
  }

  // Anchored to the bell wrapper in topbar.tsx: right-aligned to the button and
  // dropping just below it. Width is capped so it never overflows a narrow viewport.
  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-150 mt-2 w-[min(350px,calc(100vw-20px))] animate-rise overflow-hidden rounded-xl border border-line bg-card text-ink shadow-[0_20px_50px_rgba(14,20,26,0.25)]"
    >
      <div className="flex items-center justify-between border-b border-line-soft bg-card-2 px-3.5 py-2.75">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em]">შეტყობინებები</span>
        <span className="text-[11.5px] text-mut-2">{NOTIFICATION_COUNT} ახალი</span>
      </div>
      {NOTIFICATIONS.map((n) => (
        <button
          key={n.title}
          onClick={() => open(n)}
          className="flex w-full cursor-pointer items-start gap-2.5 border-b border-line-soft px-3.5 py-2.75 text-left hover:bg-soft"
        >
          <span
            className="mt-1.25 h-2 w-2 flex-none rounded-full"
            style={{ background: n.color }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold">{n.title}</span>
            <span className="block text-[11.5px] text-mut">{n.desc}</span>
          </span>
          <span className="whitespace-nowrap text-[11px] text-mut-2">{n.ago}</span>
        </button>
      ))}
      <div className="px-3.5 py-2.25 text-center text-[11px] text-mut-2">
        Push · Email · In-App — ტრიგერები იმართება ადმინისტრირებიდან
      </div>
    </div>
  )
}
