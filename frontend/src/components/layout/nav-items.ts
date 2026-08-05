import { useQuery } from '@tanstack/react-query'
import {
  Archive, BookMarked, CalendarRange, CircleDollarSign, FileText, History,
  LayoutDashboard, Map, Settings2, Smartphone, SquareCheck, TriangleAlert,
} from 'lucide-react'
import { defectsQuery } from '@/api/queries'
import { useSession } from '@/lib/session'

export interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
  locked?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** Nav model shared by the desktop sidebar and the mobile drawer. */
export function useNavGroups(): NavGroup[] {
  const { role, project } = useSession()
  const { data: defects } = useQuery(defectsQuery(project.id))
  const openQa = defects?.filter((d) => d.st !== 'დახურული').length ?? 0

  if (role?.id === 'owner') {
    return [
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
  }

  return [
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
}

/** True when `pathname` is inside `to` — shared active-link rule. */
export function isActive(pathname: string, to: string) {
  return pathname === to || (to !== '/' && pathname.startsWith(to))
}
