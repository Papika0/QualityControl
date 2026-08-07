import { useRef, useState, type RefObject } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Check, Pencil, RotateCcw, UserPlus, X } from 'lucide-react'
import { recipientsQuery, storageQuery, usersQuery } from '@/api/queries'
import {
  useAddRecipient, useRemoveRecipient, useResetDemoData, useSetUserActive,
  useUpdateRecipient,
} from '@/api/mutations'
import { isEmail, normalizeMail } from '@/lib/email'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

const MODULES = ['Dashboard', 'პროექტის რუკა', 'QA/QC', 'დავალებები', 'ნახაზები', 'დოკ. არქივი', 'ადმინისტრირება']

// 1 = full, 2 = partial, 0 = hidden
const PERMS: Record<string, number[]> = {
  admin: [1, 1, 1, 1, 1, 1, 1],
  techdir: [1, 1, 1, 1, 1, 1, 0],
  pmdir: [1, 1, 1, 1, 1, 1, 0],
  pfm: [1, 1, 1, 1, 1, 1, 0],
  pm: [1, 1, 1, 1, 1, 1, 0],
  // Supervisors report against tasks, they do not author them — partial.
  qa: [1, 1, 1, 2, 1, 0, 0],
  techsup: [1, 1, 1, 2, 1, 0, 0],
}
const HEAD = ['ადმინი', 'ტექ.დირ', 'პრ.დირ', 'პორტფ.', 'PM', 'QA', 'ტექ.ზედ']
const ROLE_KEYS = ['admin', 'techdir', 'pmdir', 'pfm', 'pm', 'qa', 'techsup']

/**
 * The manual half of the mail recipient list. The automatic half — the QA
 * member a defect is assigned to — is not editable here: those three mailboxes
 * live server-side in `server/team.ts` and the browser never sees them.
 */
function RecipientsCard({ addRef }: { addRef: RefObject<HTMLInputElement | null> }) {
  const { data: recipients = [] } = useQuery(recipientsQuery())
  const add = useAddRecipient()
  const update = useUpdateRecipient()
  const remove = useRemoveRecipient()

  const [mail, setMail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  /** Id of the row swapped into its edit form, or null when the list is idle. */
  const [editing, setEditing] = useState<string | null>(null)
  const [editMail, setEditMail] = useState('')
  const [editName, setEditName] = useState('')

  const submitAdd = () => {
    const address = normalizeMail(mail)
    if (!address) return
    if (!isEmail(address)) return setError('არასწორი ელფოსტის მისამართი')
    if (recipients.some((r) => r.mail === address)) return setError('ეს მისამართი უკვე სიაშია')
    setError('')
    add.mutate(
      { mail: address, name },
      {
        onSuccess: () => {
          setMail('')
          setName('')
        },
        onError: () => setError('ვერ შეინახა — სცადეთ ხელახლა'),
      },
    )
  }

  const submitEdit = (id: string) => {
    const address = normalizeMail(editMail)
    if (!isEmail(address)) return setError('არასწორი ელფოსტის მისამართი')
    if (recipients.some((r) => r.id !== id && r.mail === address)) {
      return setError('ეს მისამართი უკვე სიაშია')
    }
    setError('')
    update.mutate({ id, mail: address, name: editName }, { onSuccess: () => setEditing(null) })
  }

  const startEdit = (id: string, currentMail: string, currentName?: string) => {
    setEditing(id)
    setEditMail(currentMail)
    setEditName(currentName ?? '')
    setError('')
  }

  return (
    <Card>
      <CardHeader><CardTitle>ელფოსტის მიმღებები</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-2.5 text-[11px] text-mut">
          ხარვეზის შეტყობინება ავტომატურად ეგზავნება პასუხისმგებელ QA-ს. აქ დამატებული
          მისამართები ასლის სახით ერთვის იმავე წერილს.
        </p>

        <div className="flex flex-wrap gap-2">
          <Input
            ref={addRef}
            type="email"
            inputMode="email"
            placeholder="mail@example.com"
            className="min-w-45 flex-[2]"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
          />
          <Input
            placeholder="სახელი (არასავალდებულო)"
            className="min-w-35 flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
          />
          <Button className="flex-none" disabled={add.isPending} onClick={submitAdd}>
            დამატება
          </Button>
        </div>
        {error && <p className="mt-1.5 text-[11px] font-semibold text-warn">{error}</p>}

        <div className="mt-2 space-y-1">
          {recipients.length === 0 && (
            <p className="px-2 py-3 text-[11px] text-mut-2">
              დამატებითი მიმღები არ არის — შეტყობინება მხოლოდ პასუხისმგებელ QA-ს ეგზავნება.
            </p>
          )}
          {recipients.map((r) =>
            editing === r.id ? (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-soft px-2 py-2">
                <Input
                  type="email"
                  className="min-w-45 flex-[2]"
                  value={editMail}
                  onChange={(e) => setEditMail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitEdit(r.id)}
                />
                <Input
                  placeholder="სახელი"
                  className="min-w-35 flex-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitEdit(r.id)}
                />
                <button
                  type="button"
                  title="შენახვა"
                  disabled={update.isPending}
                  onClick={() => submitEdit(r.id)}
                  className="shrink-0 cursor-pointer rounded-full p-1.5 text-ok hover:bg-soft-2 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="გაუქმება"
                  onClick={() => {
                    setEditing(null)
                    setError('')
                  }}
                  className="shrink-0 cursor-pointer rounded-full p-1.5 text-mut-2 hover:bg-soft-2"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div key={r.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-soft">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{r.name || r.mail}</div>
                  {r.name && <div className="truncate text-[11px] text-mut">{r.mail}</div>}
                </div>
                <button
                  type="button"
                  title="რედაქტირება"
                  onClick={() => startEdit(r.id, r.mail, r.name)}
                  className="shrink-0 cursor-pointer rounded-full p-1.5 text-mut-2 hover:bg-soft-2 hover:text-mut-3"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="წაშლა"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(r.id)}
                  className="shrink-0 cursor-pointer rounded-full p-1.5 text-mut-2 hover:bg-soft-2 hover:text-warn disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function AdminPage() {
  const { data: users } = useSuspenseQuery(usersQuery())
  const { data: persistent } = useQuery(storageQuery())
  const setActive = useSetUserActive()
  const reset = useResetDemoData()
  const addRecipientRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <PageHeader
        title="ადმინისტრირება"
        subtitle="მომხმარებლები, როლები და მოდულების უფლებები"
        actions={
          <>
            <Button
              variant="outline"
              disabled={reset.isPending}
              onClick={() => {
                if (confirm('ყველა ცვლილება წაიშლება და დემო მონაცემები აღდგება. გავაგრძელოთ?')) {
                  reset.mutate()
                }
              }}
            >
              <RotateCcw className="h-4 w-4" />
              {reset.isPending ? 'მიმდინარეობს…' : 'დემო მონაცემების აღდგენა'}
            </Button>
            <Button
              onClick={() => {
                addRecipientRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                addRecipientRef.current?.focus()
              }}
            >
              <UserPlus className="h-4 w-4" /> მოწვევა ელფოსტით
            </Button>
          </>
        }
      />

      {persistent === false && (
        <Card className="mb-4 border-warn/40 bg-warn-soft">
          <CardContent className="p-3 text-xs font-semibold text-warn">
            IndexedDB მიუწვდომელია (ინკოგნიტო რეჟიმი?) — მონაცემები მხოლოდ ამ სესიაში შეინახება.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
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
                <button
                  type="button"
                  className="shrink-0 cursor-pointer rounded-full p-1.5 hover:bg-soft-2 disabled:opacity-50"
                  title={u.active ? 'აქტიური — დაწკაპეთ შესაზღუდად' : 'შეზღუდული — დაწკაპეთ გასააქტიურებლად'}
                  disabled={setActive.isPending}
                  onClick={() => setActive.mutate({ mail: u.mail, active: !u.active })}
                >
                  <span className={`block h-2 w-2 rounded-full ${u.active ? 'bg-ok' : 'bg-warn'}`} />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>

        <RecipientsCard addRef={addRecipientRef} />
      </div>
    </div>
  )
}
