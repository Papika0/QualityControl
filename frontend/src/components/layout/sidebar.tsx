import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard, Map, CalendarRange, TriangleAlert, SquareCheck, BookMarked,
  FileText, Archive, CircleDollarSign, History, Settings2, Smartphone, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session'
import { useQuery } from '@tanstack/react-query'
import { defectsQuery } from '@/api/queries'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
  locked?: boolean
}

export function Sidebar() {
  const { role, project } = useSession()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { data: defects } = useQuery(defectsQuery(project.id))
  const openQa = defects?.filter((d) => d.st !== 'დახურული').length ?? 0

  const isOwner = role?.id === 'owner'

  const groups: { label: string; items: NavItem[] }[] = isOwner
    ? [
        {
          label: 'ჩემი ბინა',
          items: [
            { to: '/apartments/1204', label: 'ბინა 1204', icon: LayoutDashboard },
            { to: '/drawings', label: 'ჩემი დოკუმენტები', icon: FileText },
            { to: '/audit', label: 'ისტორია', icon: History },
          ],
        },
        {
          label: 'შეზღუდული',
          items: [
            { to: '/finance', label: 'ფინანსები', icon: CircleDollarSign, locked: true },
            { to: '/map', label: 'სხვა ბინები', icon: Map, locked: true },
            { to: '/qa', label: 'შიდა QA/QC', icon: TriangleAlert, locked: true },
          ],
        },
      ]
    : [
        {
          label: 'პროექტი',
          items: [
            { to: '/', label: 'Dashboard', icon: LayoutDashboard },
            { to: '/map', label: 'პროექტის რუკა', icon: Map },
            { to: '/schedule', label: 'გეგმა-გრაფიკი', icon: CalendarRange },
          ],
        },
        {
          label: 'ოპერაციები',
          items: [
            { to: '/qa', label: 'QA/QC ხარვეზები', icon: TriangleAlert, count: openQa },
            { to: '/tasks', label: 'დავალებები', icon: SquareCheck, count: 7 },
            { to: '/standards', label: 'სტანდარტები', icon: BookMarked },
            { to: '/drawings', label: 'ნახაზები', icon: FileText },
            { to: '/archive', label: 'დოკ. არქივი', icon: Archive },
          ],
        },
        {
          label: 'კონტროლი',
          items: [
            { to: '/finance', label: 'ფინანსები', icon: CircleDollarSign, locked: !role?.canFinance },
            { to: '/audit', label: 'ისტორია / Audit Log', icon: History },
            { to: '/admin', label: 'ადმინისტრირება', icon: Settings2, locked: !role?.canAdmin },
          ],
        },
        {
          label: 'მოწყობილობები',
          items: [{ to: '/mobile', label: 'მობილური აპი — Field', icon: Smartphone }],
        },
      ]

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-card lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-extrabold text-white">K</div>
        <div>
          <div className="text-sm font-extrabold leading-tight">{project.name}</div>
          <div className="text-[11px] text-mut">ხარისხის კონტროლი</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g.label} className="mt-4">
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-mut-2">{g.label}</div>
            {g.items.map((it) => {
              const active = pathname === it.to || (it.to !== '/' && pathname.startsWith(it.to))
              if (it.locked) {
                return (
                  <div
                    key={it.to}
                    className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-mut-2 opacity-60"
                    title={`წვდომა შეზღუდულია — „${role?.name}" ამ მოდულს ვერ ხედავს`}
                  >
                    <it.icon className="h-4 w-4" />
                    <span className="flex-1">{it.label}</span>
                    <Lock className="h-3.5 w-3.5" />
                  </div>
                )
              }
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border-l-2 border-transparent px-2.5 py-2 text-sm font-medium text-mut-3 transition-colors hover:bg-soft',
                    active && 'border-brand bg-brand-soft font-bold text-brand-dark',
                  )}
                >
                  <it.icon className="h-4 w-4" />
                  <span className="flex-1">{it.label}</span>
                  {typeof it.count === 'number' && it.count > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                        active ? 'bg-brand text-white' : 'bg-soft-2 text-mut-3',
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
