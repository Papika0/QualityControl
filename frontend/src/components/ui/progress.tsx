import { cn } from '@/lib/utils'

function Progress({
  value,
  className,
  barClassName,
  barColor,
}: {
  value: number
  className?: string
  barClassName?: string
  barColor?: string
}) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-soft-2', className)}>
      <div
        className={cn('h-full rounded-full bg-brand transition-all', barClassName)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, ...(barColor ? { backgroundColor: barColor } : {}) }}
      />
    </div>
  )
}

export { Progress }
