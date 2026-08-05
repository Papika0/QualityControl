import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Camera, FileDown } from 'lucide-react'
import { apartmentQuery, aptDefectsQuery } from '@/api/queries'
import { PEOPLE, STAGES } from '@/data/domain'
import { useSession } from '@/lib/session'
import { BackLink, PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DefectDialog } from '@/components/defect-dialog'
import { hash01 } from '@/lib/utils'

export const Route = createFileRoute('/apartments/$aptNo')({
  component: ApartmentPage,
})

function ApartmentPage() {
  const { aptNo } = Route.useParams()
  const { project, role } = useSession()
  const { data: apt } = useSuspenseQuery(apartmentQuery(project.id, aptNo))
  const { data: defects } = useSuspenseQuery(aptDefectsQuery(project.id, aptNo))
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const isOwner = role?.id === 'owner'
  const A = apt ?? { no: aptNo, prog: 72, defects: 2, area: 78, rooms: 3, floor: 12, sold: true, late: false }
  const open = defects.filter((d) => d.st !== 'დახურული').length
  const doneN = Math.round((A.prog / 100) * STAGES.length)
  const selected = defects.find((d) => d.id === selectedId) ?? null

  const first = defects[0]
  const audit = [
    ['2026-06-02 11:20', 'ფოტო დაემატა', 'MEP Rough · მისაღები', 'ი. მაისურაძე'],
    ['2026-06-30 16:05', 'ეტაპი განახლდა', 'Tile → In Progress', 'ნ. ბერიძე'],
    // The QA leg of the trail only exists when this apartment has a defect.
    ...(first
      ? [
          ['2026-07-18 09:14', 'QA ჩანაწერი შეიქმნა', `${first.id} · ${first.cat} · ${first.room}`, 'გ. კვარაცხელია'],
          ['2026-07-18 09:16', 'ფოტო დაემატა (2)', 'Before · GPS 41.7093, 44.7395', 'გ. კვარაცხელია'],
          ['2026-07-18 09:20', 'რეკომენდაცია ჩაისვა', `ავტომატურად · კატეგორია: ${first.cat}`, 'სისტემა'],
          ['2026-07-18 10:02', 'დავალება მიენიჭა', `→ ${first.sub} · ვადა ${first.due}`, 'ნ. ბერიძე'],
          ['2026-07-18 10:02', 'Email + Push გაიგზავნა', '4 მიმღები', 'სისტემა'],
          ['2026-07-24 15:41', 'სტატუსი: შემოწმებაზე', 'After ფოტო დაემატა', 'ლ. ჩხეიძე'],
          ['2026-07-24 17:09', 'PDF გენერირდა და გაიგზავნა', `${first.id}.pdf`, 'სისტემა'],
        ]
      : []),
  ]

  const photos = [
    ['2026-07-18', 'სველი წერტილი', 'BEFORE', 'გ. კვარაცხელია'],
    ['2026-07-24', 'სველი წერტილი', 'AFTER', 'ლ. ჩხეიძე'],
    ['2026-06-30', 'სამზარეულო', 'PROGRESS', 'ნ. ბერიძე'],
    ['2026-06-02', 'მისაღები', 'MEP', 'ი. მაისურაძე'],
    ['2026-05-14', 'საძინებელი', 'PLASTER', 'თ. აბულაძე'],
    ['2026-04-22', 'ჰოლი', 'BLOCK', 'ზ. ხურციძე'],
  ]

  const docs = [
    [`AR-114-${aptNo}`, 'ბინის გეგმა (As Built)', 'rev. C', 'დამტკიცებული'],
    [`MEP-E-${aptNo}`, 'ელექტრო განლაგება', 'rev. B', 'დამტკიცებული'],
    [`ACT-HW-${aptNo}`, 'ფარული სამუშაოების აქტი', '—', 'ხელმოწერილი'],
    [`QA-PDF-${aptNo}`, 'QA ანგარიში · 18 ივლ', '—', 'გაგზავნილი'],
    [`WRN-${aptNo}`, 'გარანტიის პირობები', 'v2', 'ძალაშია'],
  ]

  const infoRows: [string, string][] = [
    ['ბინის ნომერი', A.no],
    ['შენობა', project.name],
    ['სართული', String(A.floor)],
    ['ოთახები', `${A.rooms} + სამზარეულო`],
    ['ფართობი', `${A.area} მ²`],
    ['სტატუსი', A.sold ? 'გაყიდული' : 'თავისუფალი'],
    ['მფლობელი', A.sold ? 'დ. გოგოლაძე' : '—'],
    ['პასუხისმგებელი PM', 'ნ. ბერიძე'],
  ]

  const remaining = [
    { m: '✓', t: 'ფარული სამუშაოების აქტები', d: 'შესრულდა', cls: 'bg-ok-soft text-ok' },
    { m: '✓', t: 'სველი წერტილების ტესტი', d: 'შესრულდა', cls: 'bg-ok-soft text-ok' },
    { m: String(Math.max(open, 1)), t: 'ღია ხარვეზების დახურვა', d: 'ვადა: 24 აგვ', cls: 'bg-tone-open-bg text-tone-open-fg' },
    { m: '·', t: 'ფინალური ინსპექცია', d: 'სექტემბერი', cls: 'bg-soft-2 text-mut-3' },
    { m: '·', t: 'Handover აქტი მფლობელთან', d: 'ნოემბერი', cls: 'bg-soft-2 text-mut-3' },
  ]

  return (
    <div>
      <PageHeader
        back={!isOwner && <BackLink to="/map">რუკაზე დაბრუნება</BackLink>}
        title={`ბინა ${A.no}`}
        subtitle={
          isOwner
            ? 'მფლობელის პორტალი — ხედავთ მხოლოდ თქვენი ბინის მონაცემებს'
            : `სართული ${A.floor} · ${project.name}`
        }
        actions={
          <Button>
            <FileDown className="h-4 w-4" /> PDF ანგარიში
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] [&>*]:min-w-0">
        {[
          { l: 'პროგრესი', v: `${A.prog}%`, bar: A.prog },
          { l: 'ფართობი', v: `${A.area} მ²` },
          { l: 'ღია ხარვეზი', v: String(open), red: open > 0 },
          { l: 'ჩაბარება', v: '30 ნოე' },
        ].map((s) => (
          <Card key={s.l}>
            <CardContent className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-mut-2">{s.l}</div>
              <div className={`mt-1 text-xl font-extrabold ${s.red ? 'text-danger-2' : ''}`}>{s.v}</div>
              {s.bar !== undefined && <Progress value={s.bar} className="mt-2" />}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="gen">
        <TabsList>
          <TabsTrigger value="gen">ზოგადი</TabsTrigger>
          <TabsTrigger value="prog">სამუშაოები</TabsTrigger>
          {!isOwner && <TabsTrigger value="qa">QA / ხარვეზები</TabsTrigger>}
          <TabsTrigger value="photos">ფოტოები</TabsTrigger>
          <TabsTrigger value="docs">დოკუმენტები</TabsTrigger>
          <TabsTrigger value="hist">ისტორია</TabsTrigger>
        </TabsList>

        <TabsContent value="gen">
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader><CardTitle>ინფორმაცია</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {infoRows.map(([k, v]) => (
                      <TableRow key={k}>
                        <TableCell className="text-mut">{k}</TableCell>
                        <TableCell className="font-semibold">{v}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>რა რჩება ჩაბარებამდე</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {remaining.map((r) => (
                  <div key={r.t} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${r.cls}`}>
                      {r.m}
                    </span>
                    <span className="flex-1 text-sm font-semibold">{r.t}</span>
                    <span className="text-xs text-mut">{r.d}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="prog">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ეტაპი</TableHead>
                    <TableHead>სტატუსი</TableHead>
                    <TableHead className="w-56">პროგრესი</TableHead>
                    <TableHead>შემსრულებელი</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {STAGES.map((s, i) => {
                    const st =
                      i < doneN ? 'Completed' : i === doneN ? 'In Progress' : hash01(aptNo + s) > 0.9 ? 'Delayed' : 'Not Started'
                    const pct = i < doneN ? 100 : i === doneN ? Math.round(hash01(aptNo + s) * 70 + 15) : 0
                    return (
                      <TableRow key={s}>
                        <TableCell className="font-semibold">{s}</TableCell>
                        <TableCell><StatusBadge status={st} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={pct}
                              barColor={st === 'Completed' ? 'var(--color-tone-ok-solid)' : st === 'Delayed' ? 'var(--color-tone-warn-solid)' : 'var(--color-tone-info-solid)'}
                              className="flex-1"
                            />
                            <span className="w-9 text-right text-xs text-mut">{pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-mut-3">
                          {pct > 0 ? PEOPLE[Math.floor(hash01(aptNo + s + 'w') * PEOPLE.length)] : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {!isOwner && (
          <TabsContent value="qa">
            <Card>
              <CardContent className="space-y-1 pt-4">
                {defects.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-mut">ხარვეზი არ ფიქსირდება.</p>
                )}
                {defects.map((d) => (
                  <button
                    key={d.id}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-soft cursor-pointer"
                    onClick={() => setSelectedId(d.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{d.id} · {d.cat}</div>
                      <div className="truncate text-xs text-mut">{d.room} · {d.desc}</div>
                    </div>
                    <StatusBadge status={d.st} />
                    <span className="text-xs text-mut">{d.due.slice(5)}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="photos">
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(230px,1fr))] [&>*]:min-w-0">
            {photos.map(([d, room, kind, who]) => (
              <Card key={d + kind} className="overflow-hidden">
                <div className="flex aspect-video items-center justify-center bg-soft text-mut-2">
                  <div className="text-center text-xs">
                    <Camera className="mx-auto mb-1 h-5 w-5" />
                    {room}
                  </div>
                </div>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-xs font-bold">{kind}</div>
                    <div className="text-[11px] text-mut">{d} · {who}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>კოდი</TableHead>
                    <TableHead>დოკუმენტი</TableHead>
                    <TableHead>რევიზია</TableHead>
                    <TableHead>სტატუსი</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map(([code, name, rev, st]) => (
                    <TableRow key={code}>
                      <TableCell className="font-bold">{code}</TableCell>
                      <TableCell>{name}</TableCell>
                      <TableCell className="text-mut">{rev}</TableCell>
                      <TableCell><StatusBadge status={st!} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hist">
          <Card>
            <CardContent className="pt-4">
              {audit.map(([t, a, d, w]) => (
                <div key={t! + a!} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                  <span className="w-32 shrink-0 text-[11px] text-mut-2">{t}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{a}</div>
                    <div className="truncate text-xs text-mut">{d}</div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      w === 'სისტემა' ? 'bg-brand-soft text-brand-dark' : 'bg-soft text-mut-3'
                    }`}
                  >
                    {w}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DefectDialog defect={selected} onClose={() => setSelectedId(null)} />
    </div>
  )
}
