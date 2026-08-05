import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-lg border border-line-2 bg-card px-3 py-1 text-sm placeholder:text-mut-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
