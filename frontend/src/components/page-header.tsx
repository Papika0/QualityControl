import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-extrabold">{title}</h1>
        {subtitle && <p className="text-xs text-mut">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
