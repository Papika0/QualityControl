import { cn } from '@/lib/utils'

/** Shimmering placeholder block. `.skeleton` carries the gradient (index.css). */
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} />
}

/** The prototype's standard route fallback: title, KPI row, then a content slab. */
function PageSkeleton() {
  return (
    <div>
      <Skeleton className="mb-3 h-3.25 w-42.5 rounded-[7px]" />
      <Skeleton className="mb-5.5 h-7.5 w-[min(340px,60%)] rounded-[9px]" />
      <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-26 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-75 rounded-xl" />
    </div>
  )
}

export { Skeleton, PageSkeleton }
