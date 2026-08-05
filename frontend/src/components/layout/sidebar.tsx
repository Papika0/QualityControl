import { Link, useRouterState } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session'
import { isActive, useNavGroups } from './nav-items'

export function Sidebar() {
  const { role, project } = useSession()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const groups = useNavGroups()

  return (
    // Hidden below the prototype's single 960px breakpoint, where <MobileNav> takes over.
    <aside className="hidden w-58 shrink-0 flex-col border-r border-line bg-side nav:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand font-display text-sm font-extrabold text-white">
          K
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold leading-tight">{project.name}</div>
          <div className="text-[11px] text-mut">ხარისხის კონტროლი</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 pb-6">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-2.5 pb-1.5 pt-3.5 text-[10px] font-bold uppercase tracking-[0.13em] text-mut-2">
              {g.label}
            </div>
            {g.items.map((it) => {
              const active = isActive(pathname, it.to)
              if (it.locked) {
                return (
                  <div
                    key={it.to}
                    className="flex cursor-not-allowed items-center gap-2.25 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-mut-2 opacity-55"
                    title={`წვდომა შეზღუდულია — „${role?.name}" ამ მოდულს ვერ ხედავს`}
                  >
                    <span className="h-3.75 w-0.75 flex-none rounded-xs" />
                    <it.icon className="h-3.75 w-3.75 opacity-85" />
                    <span className="flex-1 truncate">{it.label}</span>
                    <Lock className="h-3 w-3" />
                  </div>
                )
              }
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    'flex items-center gap-2.25 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-navink transition-colors hover:bg-soft-2',
                    active && 'bg-brand-soft font-bold text-brand-dark',
                  )}
                >
                  <span className={cn('h-3.75 w-0.75 flex-none rounded-xs', active && 'bg-brand')} />
                  <it.icon className="h-3.75 w-3.75 opacity-85" />
                  <span className="flex-1 truncate">{it.label}</span>
                  {typeof it.count === 'number' && it.count > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.75 py-px font-mono text-[10.5px]',
                        active ? 'bg-brand text-white' : 'bg-soft-3 text-mut-3',
                      )}
                    >
                      {it.count}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
