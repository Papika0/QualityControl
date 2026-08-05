import { useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { PROJECTS, ROLES, type ProjectId, type RoleId } from '@/data/domain'
import { useSession } from '@/lib/session'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

export function Topbar() {
  const { role, project, setProject, setRole, logout } = useSession()
  const navigate = useNavigate()

  return (
    <header className="flex h-14 items-center gap-3 border-b border-line bg-card px-4">
      <div className="flex items-center gap-2">
        <Select
          value={project.id}
          onValueChange={(v) => setProject(v as ProjectId)}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECTS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1" />

      <Select
        value={role?.id}
        onValueChange={(v) => {
          setRole(v as RoleId)
          navigate({ to: v === 'owner' ? '/apartments/$aptNo' : '/', params: { aptNo: '1204' } })
        }}
      >
        <SelectTrigger className="w-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2.5 border-l border-line pl-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-extrabold text-brand-dark">
          {role?.ini}
        </div>
        <div className="hidden md:block">
          <div className="text-xs font-bold leading-tight">{role?.name}</div>
          <div className="text-[10px] text-mut">{role?.scope}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} title="გასვლა">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
