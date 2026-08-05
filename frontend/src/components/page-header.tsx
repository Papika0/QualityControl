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
    <div className="mb-4.5 flex flex-wrap items-end gap-3.5">
      <div className="min-w-0 flex-1">
        {crumb && <div className="mb-1.5 font-mono text-[11px] text-mut">{crumb}</div>}
        <h1 className="text-[clamp(22px,3vw,28px)] font-extrabold leading-[1.1]">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-mut-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
