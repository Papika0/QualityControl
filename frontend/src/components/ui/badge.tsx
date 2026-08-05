import * as React from 'react'
import { cn } from '@/lib/utils'
import { statusColor } from '@/data/domain'

function Badge({
  className,
  style,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap',
        className,
      )}
      style={style}
      {...props}
    />
  )
}

/** Chip colored by domain status (defect / doc / stage statuses). */
function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { bg, c } = statusColor(status)
  return (
    <Badge className={className} style={{ backgroundColor: bg, color: c }}>
      {status}
    </Badge>
  )
}

export { Badge, StatusBadge }
