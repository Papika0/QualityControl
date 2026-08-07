import { useQuery } from '@tanstack/react-query'
import {
  Archive, BookMarked, CalendarRange, FileText,
  LayoutDashboard, Map, Settings2, SquareCheck, TriangleAlert,
} from 'lucide-react'
import { defectsQuery, tasksQuery } from '@/api/queries'
import { useSession, useTaskActor } from '@/lib/session'
import { visibleTasks } from '@/lib/task-perms'

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
  const actor = useTaskActor()
  const { data: defects } = useQuery(defectsQuery(project.id))
  const openQa = defects?.filter((d) => d.st !== 'დახურული').length ?? 0
  const { data: tasks } = useQuery(tasksQuery(project.id))
  // Counts what this role can actually open — a badge promising work a
  // supervisor cannot see reads as a broken link.
  const openTasks = visibleTasks(actor, tasks ?? []).filter((t) => t.col !== 'done').length

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
        { to: '/tasks', label: 'დავალებები', icon: SquareCheck, count: openTasks },
        { to: '/standards', label: 'სტანდარტები', icon: BookMarked },
        { to: '/drawings', label: 'ნახაზები', icon: FileText },
        { to: '/archive', label: 'დოკ. არქივი', icon: Archive },
      ],
    },
    {
      label: 'კონტროლი',
      items: [
        { to: '/admin', label: 'ადმინისტრირება', icon: Settings2, locked: !role?.canAdmin },
      ],
    },
  ]
}

/** True when `pathname` is inside `to` — shared active-link rule. */
export function isActive(pathname: string, to: string) {
  return pathname === to || (to !== '/' && pathname.startsWith(to))
}
