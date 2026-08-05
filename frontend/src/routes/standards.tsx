import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { standardsQuery } from '@/api/queries'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const STD_CATS = ['კონსტრუქცია', 'წყობა', 'ელექტროობა', 'MEP / სანტექნიკა', 'მოპირკეთება', 'ფასადი', 'მონტაჟი']

// Search + category filter are typed URL params.
interface StdSearch {
  q?: string
  cat?: string
}

export const Route = createFileRoute('/standards')({
  validateSearch: (search: Record<string, unknown>): StdSearch => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    cat: STD_CATS.includes(search.cat as string) ? (search.cat as string) : undefined,
  }),
  component: StandardsPage,
})

const FILE_COLORS: Record<string, string> = {
  PDF: 'bg-danger-soft text-danger',
  DWG: 'bg-info-soft text-info',
  DOCX: 'bg-ok-soft text-ok',
}

function StandardsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: standards } = useSuspenseQuery(standardsQuery())

  const q = (search.q ?? '').toLowerCase()
  const rows = standards.filter(
    (s) =>
      (!search.cat || s.cat === search.cat) &&
      (!q || (s.title + s.code).toLowerCase().includes(q)),
  )

  return (
    <div>
      <PageHeader
        title="სამშენებლო სტანდარტები"
        subtitle={`${rows.length} სტანდარტი — მიღების ნორმები, რომლებზეც QA ინსპექციები ეყრდნობა`}
        actions={
          <Button>
            <Plus className="h-4 w-4" /> ახალი სტანდარტი
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-mut-2" />
          <Input
            className="w-64 pl-8"
            placeholder="ძებნა…"
            value={search.q ?? ''}
            onChange={(e) =>
              navigate({ search: (p) => ({ ...p, q: e.target.value || undefined }), replace: true })
            }
          />
        </div>
        <Chip active={!search.cat} onClick={() => navigate({ search: (p) => ({ ...p, cat: undefined }), replace: true })}>
          ყველა
        </Chip>
        {STD_CATS.map((c) => (
          <Chip
            key={c}
            active={search.cat === c}
            onClick={() => navigate({ search: (p) => ({ ...p, cat: p.cat === c ? undefined : c }), replace: true })}
          >
            {c}
          </Chip>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-mut">
            ვერაფერი მოიძებნა.{' '}
            <button
              className="font-bold text-brand cursor-pointer"
              onClick={() => navigate({ search: {}, replace: true })}
            >
              ფილტრის გასუფთავება
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(260px,1fr))] [&>*]:min-w-0">
          {rows.map((s) => (
            <Card key={s.code} className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-brand">{s.code}</span>
                  <span className="text-[11px] text-mut-2">{s.rev} · {s.updated}</span>
                </div>
                <div className="mt-1.5 text-sm font-bold leading-snug">{s.title}</div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-mut-3">{s.cat}</span>
                  <div className="flex gap-1">
                    {s.files.map((f) => (
                      <span key={f} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${FILE_COLORS[f]}`}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
