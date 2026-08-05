import type { ReactNode } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

/**
 * Screen header. The prototype pairs a small mono breadcrumb with a large
 * display title on every screen — `crumb` carries the breadcrumb line.
 *
 * `back` is a dedicated top-left slot: back navigation reads as "where you came
 * from", so it belongs ahead of the title — never in `actions` on the right,
 * which is for the things you can *do* on this screen.
 */
export function PageHeader({
  back,
  crumb,
  title,
  subtitle,
  actions,
}: {
  back?: ReactNode
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
        {back && <div className="mb-1.5">{back}</div>}
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

/** The standard back control for `PageHeader`'s `back` slot. */
export function BackLink({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-mut transition-colors hover:text-brand-dark"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      {children}
    </Link>
  )
}
