import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { contractsQuery } from '@/api/queries'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const Route = createFileRoute('/finance')({
  beforeLoad: () => {
    // Role gate: only admin / techdir see finance (matrix in prototype).
    try {
      const raw = localStorage.getItem('qc-session')
      const role = raw ? (JSON.parse(raw).role as string | null) : null
      if (role !== 'admin' && role !== 'techdir') throw redirect({ to: '/' })
    } catch (e) {
      if (e && typeof e === 'object' && 'to' in e) throw e
    }
  },
  component: FinancePage,
})

const KPIS = [
  { l: 'კონტრაქტების ჯამი', v: '$1.84M', d: '11 აქტიური კონტრაქტი' },
  { l: 'გადახდილი', v: '$1.12M', d: '61% · ბოლო: 30 ივლ', cls: 'text-ok' },
  { l: 'მოთხოვნილი / განხილვაში', v: '$142K', d: '3 აქტი ელოდება ვიზას', cls: 'text-warn' },
  { l: 'Retention (5%)', v: '$92K', d: 'განიბლოკება ხარვეზების დახურვისას' },
]

const RETENTION = ['ალიანს-მშენი $38.2K', 'ტექნო-ინსტალაცია $24.1K', 'ფასად-პრო $18.4K', 'წიკლაური $11.7K']

function FinancePage() {
  const { data: contracts } = useSuspenseQuery(contractsQuery())

  return (
    <div>
      <PageHeader title="ფინანსები" subtitle="კონტრაქტორების ხელშეკრულებები, გადახდები და retention" />

      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))] [&>*]:min-w-0">
        {KPIS.map((k) => (
          <Card key={k.l}>
            <CardContent className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-mut-2">{k.l}</div>
              <div className={`mt-1 text-2xl font-extrabold ${k.cls ?? ''}`}>{k.v}</div>
              <div className="mt-0.5 text-[11px] text-mut">{k.d}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ქვეკონტრაქტორი</TableHead>
                <TableHead>სამუშაოს ფარგლები</TableHead>
                <TableHead className="w-44">შესრულება</TableHead>
                <TableHead>კონტრაქტი</TableHead>
                <TableHead>გადახდილი</TableHead>
                <TableHead>სტატუსი</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c.sub}>
                  <TableCell className="font-bold">{c.sub}</TableCell>
                  <TableCell className="text-mut-3">{c.scope}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={c.pct} className="flex-1" />
                      <span className="w-9 text-right text-xs text-mut">{c.pct}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold">{c.amt}</TableCell>
                  <TableCell className="text-ok">{c.paid}</TableCell>
                  <TableCell><StatusBadge status={c.st} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-mut-2">
            Retention — დაბლოკილი QA ხარვეზების გამო
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RETENTION.map((r) => (
              <span key={r} className="rounded-full bg-warn-soft px-3 py-1 text-xs font-bold text-warn">
                {r}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
