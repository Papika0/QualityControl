import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { auditQuery } from '@/api/queries'
import { useSession } from '@/lib/session'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'

export const Route = createFileRoute('/audit')({
  component: AuditPage,
})

function AuditPage() {
  const { role } = useSession()
  const { data: log } = useSuspenseQuery(auditQuery())
  const [range, setRange] = useState<'all' | 'week'>('all')

  const isOwner = role?.id === 'owner'
  let rows = range === 'week' ? log.slice(0, 6) : log
  if (isOwner) rows = rows.filter((r) => r.detail.includes('1204') || r.detail.includes('QA კვირის'))

  return (
    <div>
      <PageHeader
        title="ისტორია / Audit Log"
        subtitle="ყველა ქმედება უცვლელად ფიქსირდება — წაშლა შეუძლებელია"
        actions={
          <div className="flex gap-1.5">
            <Chip active={range === 'all'} onClick={() => setRange('all')}>ყველა</Chip>
            <Chip active={range === 'week'} onClick={() => setRange('week')}>ბოლო 48 სთ</Chip>
          </div>
        }
      />
      <Card>
        <CardContent className="pt-4">
          {rows.map((e) => (
            <div key={e.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <span className="w-36 shrink-0 font-mono text-[11px] text-mut-2">{e.t}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{e.action}</div>
                <div className="truncate text-xs text-mut">{e.detail}</div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  e.who === 'სისტემა' ? 'bg-brand-soft text-brand-dark' : 'bg-soft text-mut-3'
                }`}
              >
                {e.who}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
