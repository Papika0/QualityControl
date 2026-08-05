import type { ReactNode } from 'react'

/**
 * Screen header. The prototype pairs a small mono breadcrumb with a large
 * display title on every screen — `crumb` carries the breadcrumb line.
 */
export function PageHeader({
  crumb,
  title,
  subtitle,
  actions,
}: {
  crumb?: string
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    // `basis-72` lets the actions wrap onto their own line on a phone instead of
    // squeezing the title — a `flex-1` title would shrink to nothing first.
    <div className="mb-4.5 flex flex-wrap items-end justify-between gap-x-3.5 gap-y-3">
      <div className="min-w-0 flex-1 basis-72">
        {crumb && <div className="mb-1.5 truncate font-mono text-[11px] text-mut">{crumb}</div>}
        <h1 className="text-[clamp(20px,3vw,28px)] font-extrabold leading-[1.1] text-balance">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-mut-2">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 [&>*]:min-w-0 [&>button]:max-w-full">
          {actions}
        </div>
      )}
    </div>
  )
}
