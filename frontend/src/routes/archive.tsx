import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { archiveQuery } from '@/api/queries'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { Chip } from '@/components/ui/chip'

const TYPES = ['ხელშეკრულება', 'აქტი', 'ინვოისი', 'ცნობა']

interface ArchiveSearch {
  type?: string
}

export const Route = createFileRoute('/archive')({
  validateSearch: (search: Record<string, unknown>): ArchiveSearch => ({
    type: TYPES.includes(search.type as string) ? (search.type as string) : undefined,
  }),
  component: ArchivePage,
})

const EXT_COLORS: Record<string, string> = {
  PDF: 'bg-danger-soft text-danger',
  XLS: 'bg-ok-soft text-ok',
  IMG: 'bg-info-soft text-info',
}

function ArchivePage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: rows } = useSuspenseQuery(archiveQuery())

  const filtered = rows.filter(
    (d) => !search.type || d.name.includes(search.type) || d.meta.includes(search.type),
  )

  return (
    <div>
      <PageHeader title="დოკუმენტების არქივი" subtitle="ხელშეკრულებები · აქტები · ინვოისები · ცნობები" />

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip active={!search.type} onClick={() => navigate({ search: {}, replace: true })}>
          ყველა
        </Chip>
        {TYPES.map((t) => (
          <Chip
            key={t}
            active={search.type === t}
            onClick={() =>
              navigate({ search: (p) => ({ type: p.type === t ? undefined : t }), replace: true })
            }
          >
            {t}
          </Chip>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-1 pt-4">
          {filtered.map((d) => (
            <div key={d.name} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-soft">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold ${EXT_COLORS[d.ext] ?? 'bg-soft-2 text-mut-3'}`}>
                {d.ext}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{d.name}</div>
                <div className="text-[11px] text-mut">{d.meta}</div>
              </div>
              {d.amt !== '—' && <span className="text-sm font-bold">{d.amt}</span>}
              <StatusBadge status={d.st} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
