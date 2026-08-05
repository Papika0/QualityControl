import { cn } from '@/lib/utils'

/** Filter chip — the selectable pill used across QA, standards and archive filters. */
function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer',
        active
          ? 'border-brand bg-brand-soft text-brand-dark'
          : 'border-line-2 bg-card text-mut-3 hover:bg-soft',
        className,
      )}
    >
      {children}
    </button>
  )
}

export { Chip }
