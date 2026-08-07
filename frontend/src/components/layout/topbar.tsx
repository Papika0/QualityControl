import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bell, LogOut, Moon, Search, Sparkles, Sun } from 'lucide-react'
import { PROJECTS, QA_TEAM, ROLES, type ProjectId, type RoleId } from '@/data/domain'
import { needsPerson, useSession } from '@/lib/session'
import { useTheme } from '@/lib/theme'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { NotificationPanel } from '@/components/notifications'
import { SearchDialog } from '@/components/search-dialog'
import { ChatPanel } from '@/components/chat-panel'

export function Topbar() {
  const { role, person, project, setProject, setRole, setPerson, logout } = useSession()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (k === 'j') {
        e.preventDefault()
        setChatOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="relative flex h-14 items-center gap-3 border-b border-line bg-card px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* Below `nav` the sidebar is gone, and the brand mark it carries goes
            with it — which left the project name as the first thing on the
            screen, hard against the corner. Putting the mark back on mobile
            only opens the header with the product on every viewport. */}
        <div className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand font-display text-sm font-extrabold text-white nav:hidden">
          K
        </div>
        <Select value={project.id} onValueChange={(v) => setProject(v as ProjectId)}>
          {/* Narrower on a phone to pay for the mark; the trigger already
              truncates, and the full name is there once the list opens. */}
          <SelectTrigger className="w-40 nav:w-52">
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

      <button
        onClick={() => setSearchOpen(true)}
        className="hidden max-w-110 flex-1 cursor-text items-center gap-2.25 rounded-lg border border-line-2 bg-soft px-3 py-2 text-left text-[12.5px] text-mut-2 hover:border-mut-2 nav:flex"
      >
        <Search className="h-3.25 w-3.25" />
        <span className="flex-1 truncate">ძებნა — ბინა, ხარვეზი, დოკუმენტი…</span>
        <span className="rounded border border-line-2 px-1.5 font-mono text-[10px]">⌘K</span>
      </button>

      {/* Right cluster — ml-auto pins it to the edge once the capped search box
          stops growing, matching the prototype's margin-left:auto group. */}
      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={() => setSearchOpen(true)}
          title="ძებნა"
          className="grid h-8.5 w-8.5 cursor-pointer place-items-center rounded-lg text-mut-3 hover:bg-soft nav:hidden"
        >
          <Search className="h-4 w-4" />
        </button>

        {/* The assistant reads the same data the screens do and answers with a
            link into them, so it belongs beside search rather than in the nav. */}
        <button
          onClick={() => setChatOpen(true)}
          title="ასისტენტი — ⌘J"
          className="grid h-8.5 w-8.5 cursor-pointer place-items-center rounded-lg text-mut-3 hover:bg-soft"
        >
          <Sparkles className="h-4 w-4" />
        </button>

        <button
          onClick={toggle}
          title="თემის შეცვლა"
          className="grid h-8.5 w-8.5 cursor-pointer place-items-center rounded-lg text-mut-3 hover:bg-soft"
        >
          {theme === 'dark' ? <Sun className="h-3.75 w-3.75" /> : <Moon className="h-3.75 w-3.75" />}
        </button>

        {/* The panel anchors to this wrapper, so it drops directly under the bell
            rather than under the header's right edge. */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen((o) => !o)}
            title="შეტყობინებები"
            className="relative grid h-8.5 w-8.5 cursor-pointer place-items-center rounded-lg text-mut-3 hover:bg-soft"
          >
            <Bell className="h-4.25 w-4.25" />
            <span className="absolute right-1.5 top-1.5 h-1.75 w-1.75 rounded-full border-[1.5px] border-card bg-brand" />
          </button>
          {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
        </div>

        <Select
          value={role?.id}
          onValueChange={(v) => {
            setRole(v as RoleId)
            navigate({ to: '/' })
          }}
        >
          <SelectTrigger className="hidden w-52.5 nav:flex">
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

        {/* Which supervisor is on shift. Only the two personal roles get it —
            a task board is one person's, and the demo has to be able to switch
            between them without logging out. */}
        {needsPerson(role?.id) && (
          <Select value={person?.id} onValueChange={setPerson}>
            <SelectTrigger className="hidden w-44 nav:flex">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QA_TEAM.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-2.5 border-l border-line pl-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-extrabold text-brand-dark">
            {role?.ini}
          </div>
          <div className="hidden nav:block">
            <div className="text-xs font-bold leading-tight">{person?.name ?? role?.name}</div>
            <div className="text-[10px] text-mut">{person ? role?.name : role?.scope}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} title="გასვლა">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </header>
  )
}
