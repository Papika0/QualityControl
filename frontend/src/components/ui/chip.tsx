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
        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
        active
          ? 'border-chip-a bg-chip-a text-chip-a-fg'
          : 'border-line-2 bg-card text-mut-3 hover:bg-soft',
        className,
      )}
    >
      {children}
    </button>
  )
}

export { Chip }
