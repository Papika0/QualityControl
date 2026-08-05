import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { apartmentsQuery, defectsQuery } from '@/api/queries'
import { useSession } from '@/lib/session'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface Hit {
  key: string
  title: string
  meta: string
  go: () => void
}

/** How many hits to show per group before the list gets unwieldy. */
const PER_GROUP = 6

/** ⌘K command palette over the current project's apartments and defects. */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project } = useSession()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const { data: apts } = useQuery({ ...apartmentsQuery(project.id), enabled: open })
  const { data: defects } = useQuery({ ...defectsQuery(project.id), enabled: open })

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match = (...fields: string[]) =>
      !needle || fields.some((f) => f.toLowerCase().includes(needle))

    const aptHits: Hit[] = (apts ?? [])
      .filter((a) => match(a.no, String(a.floor)))
      .slice(0, PER_GROUP)
      .map((a) => ({
        key: a.no,
        title: `ბინა · ${a.floor} სართული · ${a.area} მ²`,
        meta: `${a.prog}%${a.defects ? ` · ${a.defects} ხარვეზი` : ''}`,
        go: () => {
          onClose()
          navigate({ to: '/apartments/$aptNo', params: { aptNo: a.no } })
        },
      }))

    const defHits: Hit[] = (defects ?? [])
      .filter((d) => match(d.id, d.cat, d.apt, d.room, d.sub))
      .slice(0, PER_GROUP)
      .map((d) => ({
        key: d.id,
        title: `${d.cat} · ${d.room} · ბინა ${d.apt}`,
        meta: d.st,
        go: () => {
          onClose()
          navigate({ to: '/qa', search: { id: d.id } })
        },
      }))

    return [
      { label: 'ბინები', rows: aptHits },
      { label: 'ხარვეზები', rows: defHits },
    ].filter((g) => g.rows.length > 0)
  }, [apts, defects, q, navigate, onClose])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showClose={false} className="top-[8vh] max-w-140 translate-y-0">
        <DialogTitle className="sr-only">ძებნა</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3.5">
          <Search className="h-3.75 w-3.75 flex-none text-mut-2" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ბინა, ხარვეზი, დოკუმენტი, ადამიანი…"
            className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] focus:outline-none"
          />
          <span className="rounded border border-line-2 px-1.5 font-mono text-[10px] text-mut-2">
            ESC
          </span>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-4 pb-1 pt-2.25 text-[10px] font-bold uppercase tracking-[0.12em] text-mut-2">
                {g.label}
              </div>
              {g.rows.map((r) => (
                <button
                  key={r.key}
                  onClick={r.go}
                  className="flex w-full cursor-pointer items-center gap-2.75 px-4 py-2.25 text-left text-[13px] hover:bg-soft"
                >
                  <span className="min-w-18.5 font-mono text-[11px] text-brand">{r.key}</span>
                  <span className="flex-1 truncate">{r.title}</span>
                  <span className="text-[11px] text-mut-2">{r.meta}</span>
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-mut-2">
              „{q}" — შედეგი ვერ მოიძებნა
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
