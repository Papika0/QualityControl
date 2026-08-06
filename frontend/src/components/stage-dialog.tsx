import { CircleCheck, Lock } from 'lucide-react'
import { stageBlockers } from '@/api/client'
import { useAdvanceStage, useSetStageAssignee } from '@/api/mutations'
import {
  PEOPLE, STAGE_ACTION, STAGE_CATS, nextStageStatus,
  type Defect, type Stage,
} from '@/data/domain'
import { useToast } from '@/lib/toast'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * The tracking flow for one stage of one apartment. QA is the only actor: there
 * is no hand-off from a crew, so the dialog shows the one move available and,
 * when that move is acceptance, what still stands in its way.
 */
export function StageDialog({
  stage,
  defects,
  canTrack,
  onClose,
}: {
  stage: Stage
  /** Every defect on the apartment — the gate reads the open ones. */
  defects: Defect[]
  canTrack: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const advance = useAdvanceStage()
  const setAssignee = useSetStageAssignee()

  const next = nextStageStatus(stage.st)
  const action = STAGE_ACTION[stage.st]
  const blockers = stageBlockers(stage.stage, defects)
  const gated = next === 'Completed'
  const blocked = gated && blockers.length > 0
  const cats: readonly string[] = STAGE_CATS[stage.stage]
  // An entry is a category or a single ჯგუფი; either way it names the work the
  // stage answers for, so the list reads the same to the inspector.
  const catLabel = cats.includes('*') ? 'ყველა კატეგორია' : cats.join(' · ')

  const onAdvance = () => {
    advance.mutate(
      { apt: stage.apt, stage: stage.stage },
      {
        onSuccess: (res) => {
          if (res.ok) {
            toast({
              kind: 'ok',
              title: res.stage?.st === 'Completed' ? 'ეტაპი მიღებულია' : 'სტატუსი განახლდა',
              desc: `${stage.stage} · ბინა ${stage.apt}`,
            })
            onClose()
            return
          }
          toast({
            kind: 'warn',
            title: 'მიღება დაბლოკილია',
            // The gate list runs to a full paragraph for some stages — the toast
            // gives the count, the dialog behind it spells out which works.
            desc: `${res.blockedBy.length} ღია ხარვეზი ამ ეტაპის სამუშაოებზე`,
          })
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-140">
        <DialogHeader className="flex flex-wrap items-center gap-2.5 pr-14">
          <DialogTitle>{stage.stage}</DialogTitle>
          <span className="font-mono text-xs text-mut">ბინა {stage.apt}</span>
          <StatusBadge status={stage.st} />
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <Field label="შემსრულებელი">
              {canTrack ? (
                <select
                  value={stage.who}
                  onChange={(e) =>
                    setAssignee.mutate({ apt: stage.apt, stage: stage.stage, who: e.target.value })
                  }
                  disabled={setAssignee.isPending}
                  className="h-9 w-full cursor-pointer rounded-lg border border-line-2 bg-card px-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  <option value="">—</option>
                  {PEOPLE.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm font-semibold">{stage.who || '—'}</div>
              )}
            </Field>
            <Field label="ბოლო ცვლილება">
              <div className="text-sm font-semibold">{stage.at || '—'}</div>
            </Field>
          </div>

          {/* The gate, stated whether or not it currently bites — the rule is
              the point of the flow, so it should be visible before it blocks. */}
          <div
            className={
              blocked
                ? 'rounded-[11px] border border-l-[3px] border-line border-l-danger bg-card p-3.5'
                : 'rounded-[11px] border border-line bg-card p-3.5'
            }
          >
            <div className="mb-1.5 flex items-center gap-2 text-[13px] font-bold">
              {blocked ? (
                <>
                  <Lock className="h-3.75 w-3.75 text-danger" /> მიღება დაბლოკილია
                </>
              ) : (
                <>
                  <CircleCheck className="h-3.75 w-3.75 text-ok" /> მიღების პირობა დაკმაყოფილებულია
                </>
              )}
            </div>
            <p className="text-xs leading-relaxed text-mut">
              ეტაპი მიიღება მხოლოდ მაშინ, როცა დახურულია ამ სამუშაოების ყველა ხარვეზი:{' '}
              <span className="font-semibold text-mut-3">{catLabel}</span>
            </p>
            {blocked && (
              <div className="mt-2.5 space-y-1">
                {blockers.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 rounded-lg bg-soft px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-mono text-[11px] text-mut">{d.id}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {d.group ?? d.cat} — {d.room}
                    </span>
                    <StatusBadge status={d.st} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            დახურვა
          </Button>
          {canTrack && action && (
            <Button onClick={onAdvance} disabled={blocked || advance.isPending}>
              {action}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-mut-2">
        {label}
      </span>
      {children}
    </label>
  )
}
