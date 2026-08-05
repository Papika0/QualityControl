import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { BellRing } from 'lucide-react'
import { apartmentsQuery, defectsQuery, tasksQuery } from '@/api/queries'
import { CATS } from '@/data/domain'
import { useSession } from '@/lib/session'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { initials } from '@/lib/utils'

export const Route = createFileRoute('/')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(defectsQuery('NTB'))
  },
  component: DashboardPage,
})

const MONTHS = ['მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ']
const PLAN = [4, 12, 22, 34, 47, 60, 72, 84, 94, 100]
const FACT = [3, 10, 19, 30, 42, 54, 64]

const DONUT_COLORS = ['#C2410C', '#2447C6', '#92670A', '#0E7D52']

function DashboardPage() {
  const { project } = useSession()
  const navigate = useNavigate()
  const { data: apts } = useSuspenseQuery(apartmentsQuery(project.id))
  const { data: defects } = useSuspenseQuery(defectsQuery(project.id))
  const { data: tasks } = useSuspenseQuery(tasksQuery())

  const avg = Math.round(apts.reduce((s, a) => s + a.prog, 0) / apts.length)
  const done = apts.filter((a) => a.prog >= 100).length
  const open = defects.filter((d) => d.st !== 'დახურული').length
  const highOpen = defects.filter((d) => d.pri === 'high' && d.st !== 'დახურული').length

  const progressData = MONTHS.map((m, i) => ({
    m,
    plan: PLAN[i],
    fact: FACT[i] ?? null,
  }))

  const byStatus = (['ღია', 'მიმდინარე', 'შემოწმებაზე', 'დახურული'] as const).map((s) => ({
    name: s,
    value: defects.filter((d) => d.st === s).length,
  }))

  const topCats = CATS.map((c) => ({ c, n: defects.filter((d) => d.cat === c).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)
  const maxCat = topCats[0]?.n ?? 1

  const workload = new Map<string, number>()
  tasks.forEach((t) => {
    if (t.col !== 'done') workload.set(t.who, (workload.get(t.who) ?? 0) + 1)
  })

  const kpis = [
    { l: 'მთლიანი პროგრესი', v: `${avg}%`, d: `გეგმა: ${avg + 6}% — ჩამორჩენა 6 პპ`, bar: avg, barColor: '#FF4D00' },
    { l: 'ჩაბარებული ბინა', v: `${done} / ${apts.length}`, d: 'Handover აქტით დადასტურებული', bar: Math.round((done / apts.length) * 100), barColor: '#0E7D52' },
    { l: 'ღია ხარვეზი', v: `${open}`, d: `${highOpen} მაღალი პრიორიტეტის`, bar: 56, barColor: '#C2410C', red: true },
    { l: 'აქტიური დავალება', v: '7', d: '1 ვადაგადაცილებული · 6 თანამშრომელი', bar: 64, barColor: '#2447C6' },
  ]

  const overdue = [
    { id: 'QA-0903-021', t: 'Electrical — კაბელის კვეთა', who: 'შპს ტექნო-ინსტალაცია', d: '−8 დღე', bad: true },
    { id: 'T-2104', t: 'კაბელების დაქსელვის შემოწმება — მე-11', who: 'ი. მაისურაძე', d: '−5 დღე', bad: true },
    { id: 'QA-0611-017', t: 'Plumbing — მილის დახრილობა', who: 'ი/მ ჯ. წიკლაური', d: '−2 დღე', bad: false },
    { id: 'MEP-E-09', t: 'rev. C — ვიზირება ელოდება', who: 'ტექ. დირექტორი', d: 'დღეს', bad: false },
  ]

  const activity = [
    { t: 'დღეს 09:42', d: '2 ფოტო დაემატა · QA-1204-017', w: 'გკ' },
    { t: 'დღეს 09:15', d: 'PDF ანგარიში გაეგზავნა 4 მიმღებს', w: 'სისტემა' },
    { t: 'დღეს 08:58', d: 'სტატუსი „შემოწმებაზე" · ბინა 712', w: 'ლჩ' },
    { t: 'დღეს 08:30', d: 'Tile ეტაპი დაიწყო · ბინა 1104', w: 'ნბ' },
    { t: 'გუშინ 17:12', d: 'ფარული სამუშაოების აქტი · ბინა 405', w: 'იმ' },
  ]

  return (
    <div>
      <PageHeader
        crumb={`პროექტები / ${project.id} / Dashboard`}
        title={project.name}
        subtitle={`${project.addr} · ${apts.length} ბინა · ჩაბარება: 2027 ივნ`}
      />

      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        {kpis.map((k) => (
          <Card key={k.l}>
            <CardContent className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-mut-2">{k.l}</div>
              <div className={`mt-1 text-2xl font-extrabold ${k.red ? 'text-danger-2' : ''}`}>{k.v}</div>
              <div className="mt-0.5 text-[11px] text-mut">{k.d}</div>
              <Progress value={k.bar} barColor={k.barColor} className="mt-3" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>პროგრესი — გეგმა vs ფაქტი</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressData} margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#e4e6e0" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip formatter={(v) => `${v ?? ''}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line name="გეგმა" dataKey="plan" stroke="#8A949B" strokeDasharray="5 4" strokeWidth={2} dot={false} />
                <Line name="ფაქტი" dataKey="fact" stroke="#FF4D00" strokeWidth={2.5} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ხარვეზები სტატუსით</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="85%" paddingAngle={2}>
                  {byStatus.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>ტოპ კატეგორიები · {defects.length} ხარვეზი</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topCats.map((x, i) => (
              <Link
                key={x.c}
                to="/qa"
                search={{ cat: x.c }}
                className="block cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    <span className={i < 3 ? 'text-brand' : 'text-mut-2'}>{String(i + 1).padStart(2, '0')}</span>{' '}
                    {x.c}
                  </span>
                  <span className="text-mut">{x.n}</span>
                </div>
                <Progress
                  value={(x.n / maxCat) * 100}
                  barColor={i < 3 ? '#FF4D00' : '#8A949B'}
                  className="mt-1"
                />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-danger">ვადაგადაცილებული · 4</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {overdue.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-soft">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.t}</div>
                  <div className="text-[11px] text-mut">
                    {r.id} · {r.who}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.bad ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'}`}
                >
                  {r.d}
                </span>
                <button
                  className="rounded-md p-1.5 text-mut-2 hover:bg-soft-2 hover:text-ink cursor-pointer"
                  title="შეხსენების გაგზავნა"
                >
                  <BellRing className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>დატვირთვა / აქტივობა</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {[...workload.entries()].map(([name, n]) => (
                <button
                  key={name}
                  className="block w-full text-left cursor-pointer"
                  onClick={() => navigate({ to: '/tasks', search: { who: name } })}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{name}</span>
                    <span className="text-mut">{n} დავალება</span>
                  </div>
                  <Progress value={Math.min(100, n * 25)} barColor={n >= 4 ? '#92670A' : '#0E7D52'} className="mt-1" />
                </button>
              ))}
            </div>
            <div className="border-t border-line pt-3">
              {activity.map((a) => (
                <div key={a.t + a.d} className="flex items-center gap-2 py-1.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-soft-2 text-[9px] font-bold text-mut-3">
                    {a.w === 'სისტემა' ? 'SYS' : initials(a.w)}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-xs">{a.d}</div>
                  <div className="shrink-0 text-[10px] text-mut-2">{a.t}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
