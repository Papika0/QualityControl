import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { usersQuery } from '@/api/queries'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    try {
      const raw = localStorage.getItem('qc-session')
      const role = raw ? (JSON.parse(raw).role as string | null) : null
      if (role !== 'admin') throw redirect({ to: '/' })
    } catch (e) {
      if (e && typeof e === 'object' && 'to' in e) throw e
    }
  },
  component: AdminPage,
})

const MODULES = ['Dashboard', 'პროექტის რუკა', 'QA/QC', 'დავალებები', 'ნახაზები', 'დოკ. არქივი', 'ფინანსები', 'ადმინისტრირება']

// 1 = full, 2 = partial, 0 = hidden
const PERMS: Record<string, number[]> = {
  admin: [1, 1, 1, 1, 1, 1, 1, 1],
  techdir: [1, 1, 1, 1, 1, 1, 1, 0],
  pm: [1, 1, 1, 1, 1, 1, 0, 0],
  qa: [1, 1, 1, 1, 1, 0, 0, 0],
  sub: [0, 0, 2, 2, 1, 0, 0, 0],
  owner: [0, 2, 0, 0, 0, 2, 0, 0],
}
const HEAD = ['ადმინი', 'ტექ.დირ', 'PM', 'QA', 'ქვეკონტრ.', 'მფლობ.']
const ROLE_KEYS = ['admin', 'techdir', 'pm', 'qa', 'sub', 'owner']

function AdminPage() {
  const { data: users } = useSuspenseQuery(usersQuery())

  return (
    <div>
      <PageHeader
        title="ადმინისტრირება"
        subtitle="მომხმარებლები, როლები და მოდულების უფლებები"
        actions={
          <Button>
            <UserPlus className="h-4 w-4" /> მოწვევა ელფოსტით
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>უფლებების მატრიცა</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>მოდული</TableHead>
                  {HEAD.map((h) => (
                    <TableHead key={h} className="text-center">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULES.map((m, i) => (
                  <TableRow key={m}>
                    <TableCell className="font-semibold">{m}</TableCell>
                    {ROLE_KEYS.map((r) => {
                      const p = PERMS[r]![i]
                      return (
                        <TableCell key={r} className="text-center">
                          <span
                            className={
                              p === 1 ? 'text-ok' : p === 2 ? 'text-warn' : 'text-line-2'
                            }
                          >
                            {p === 1 ? '●' : p === 2 ? '◐' : '—'}
                          </span>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-[11px] text-mut">● სრული წვდომა · ◐ ნაწილობრივი (მხოლოდ საკუთარი) · — დამალული</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>მომხმარებლები</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {users.map((u) => (
              <div key={u.mail} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-soft">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft-2 text-xs font-bold text-mut-3">
                  {u.ini}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{u.name}</div>
                  <div className="truncate text-[11px] text-mut">{u.mail}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold">{u.role}</div>
                  <div className="text-[11px] text-mut">{u.scope}</div>
                </div>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${u.active ? 'bg-ok' : 'bg-warn'}`}
                  title={u.active ? 'აქტიური' : 'შეზღუდული'}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
