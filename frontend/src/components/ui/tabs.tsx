import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

/**
 * A scroll rail, not a wrapping row. Given a narrow viewport a plain flex list
 * squeezes its triggers until the labels break onto two lines and the tail of
 * the strip pushes the page into a horizontal scroll — so the strip itself
 * takes the overflow and each trigger keeps its intrinsic width.
 */
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex items-center gap-1 overflow-x-auto border-b border-line', className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-mut transition-colors hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink cursor-pointer',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-4 focus-visible:outline-none', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
