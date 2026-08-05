import { useEffect, useState } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Ellipsis, LayoutDashboard, Lock, Map, SquareCheck, TriangleAlert,
} from 'lucide-react'
import { defectsQuery } from '@/api/queries'
import { useSession } from '@/lib/session'
import { useToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { isActive, useNavGroups } from './nav-items'

/**
 * Bottom tab bar + "more" drawer, shown below the 960px breakpoint where the
 * sidebar is hidden. Mirrors the prototype's mobile shell.
 */
export function MobileNav() {
  const { role, project } = useSession()
  const toast = useToast()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const groups = useNavGroups()
  const { data: defects } = useQuery(defectsQuery(project.id))
  const [open, setOpen] = useState(false)

  const isOwner = role?.id === 'owner'
  const openQa = defects?.filter((d) => d.st !== 'დახურული').length ?? 0

  // Close the sheet on Escape and whenever the route changes.
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const denied = () =>
    toast({ kind: 'warn', title: 'წვდომა შეზღუდულია', desc: role?.scope ?? '' })

  const tabs = [
    {
      label: 'Dashboard',
      icon: LayoutDashboard,
      to: isOwner ? '/apartments/1204' : '/',
      badge: 0,
    },
    { label: 'რუკა', icon: Map, to: '/map', badge: 0, blocked: isOwner },
    { label: 'QA/QC', icon: TriangleAlert, to: '/qa', badge: isOwner ? 0 : openQa, blocked: isOwner },
    { label: 'დავალებები', icon: SquareCheck, to: '/tasks', badge: 0, blocked: isOwner },
  ]

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-120 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] nav:hidden">
        {tabs.map((t) => {
          const active = isActive(pathname, t.to)
          return (
            <button
              key={t.label}
              onClick={() => (t.blocked ? denied() : navigate({ to: t.to }))}
              className={cn(
                'relative flex flex-1 cursor-pointer flex-col items-center gap-0.75 pb-1.75 pt-2',
                active ? 'text-brand' : 'text-mut',
              )}
            >
              <t.icon className="h-4.75 w-4.75" />
              <span className="text-[9.5px] font-semibold">{t.label}</span>
              {t.badge > 0 && (
                <span className="absolute right-[calc(50%-22px)] top-0.75 rounded-full bg-brand px-1.25 font-mono text-[9px] text-white">
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex flex-1 cursor-pointer flex-col items-center gap-0.75 pb-1.75 pt-2',
            open ? 'text-brand' : 'text-mut',
          )}
        >
          <Ellipsis className="h-4.75 w-4.75" />
          <span className="text-[9.5px] font-semibold">მეტი</span>
        </button>
      </nav>

      {open && (
        <div className="nav:hidden">
          <div
            className="fixed inset-0 z-130 bg-[rgba(14,18,22,0.5)]"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-140 max-h-[70vh] animate-sheet-up overflow-y-auto rounded-t-2xl bg-card px-3.5 pb-7.5 pt-2">
            <div className="mx-auto mb-1.5 mt-2 h-1 w-10 rounded-full bg-line-2" />
            {groups.map((g) => (
              <div key={g.label}>
                <div className="px-1.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.13em] text-mut-2">
                  {g.label}
                </div>
                {g.items.map((it) => {
                  const active = isActive(pathname, it.to)
                  if (it.locked) {
                    return (
                      <button
                        key={it.to}
                        onClick={denied}
                        className="flex w-full cursor-pointer items-center gap-2.5 border-b border-line px-2 py-2.75 text-left text-sm text-mut-2 opacity-55"
                      >
                        <span className="h-4 w-0.75 flex-none rounded-xs" />
                        <it.icon className="h-4 w-4 opacity-85" />
                        <span className="flex-1 truncate">{it.label}</span>
                        <Lock className="h-3.25 w-3.25" />
                      </button>
                    )
                  }
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      className={cn(
                        'flex items-center gap-2.5 border-b border-line px-2 py-2.75 text-sm text-navink',
                        active && 'font-bold text-brand-dark',
                      )}
                    >
                      <span
                        className={cn('h-4 w-0.75 flex-none rounded-xs', active && 'bg-brand')}
                      />
                      <it.icon className="h-4 w-4 opacity-85" />
                      <span className="flex-1 truncate">{it.label}</span>
                      {typeof it.count === 'number' && it.count > 0 && (
                        <span className="rounded-full bg-soft-3 px-1.75 py-px font-mono text-[10.5px] text-mut-3">
                          {it.count}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
