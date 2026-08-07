import * as React from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex w-full resize-y rounded-lg border border-line-2 bg-card px-3 py-2 text-sm placeholder:text-mut-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
