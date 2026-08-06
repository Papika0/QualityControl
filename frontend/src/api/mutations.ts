// Write hooks. Each one invalidates every query key the write touches; the ones
// that record authorship also name the actor from the current session.

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { DefectStatus, StageName, TaskColumn } from '@/data/domain'
import { useSession } from '@/lib/session'
import { api, type NewDefectInput } from './client'

/** Falls back to a generic label when a route is somehow rendered logged out. */
function useActor(): string {
  const { role } = useSession()
  return role?.name ?? 'უცნობი მომხმარებელი'
}

const invalidate = (qc: QueryClient, keys: string[]) =>
  Promise.all(keys.map((key) => qc.invalidateQueries({ queryKey: [key] })))

export function useCreateDefect() {
  const qc = useQueryClient()
  const { project } = useSession()
  const actor = useActor()
  return useMutation({
    mutationFn: (input: NewDefectInput) => api.defects.create(project.id, input, actor),
    onSuccess: () => invalidate(qc, ['defects', 'apartments']),
  })
}

export function useSetDefectStatus() {
  const qc = useQueryClient()
  const { project } = useSession()
  const actor = useActor()
  return useMutation({
    mutationFn: ({ id, st }: { id: string; st: DefectStatus }) =>
      api.defects.setStatus(project.id, id, st, actor),
    onSuccess: () => invalidate(qc, ['defects', 'apartments']),
  })
}

export function useAddDefectComment(defectId: string) {
  const qc = useQueryClient()
  const { project } = useSession()
  const actor = useActor()
  return useMutation({
    mutationFn: (text: string) => api.defects.addComment(project.id, defectId, actor, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['defectComments', project.id, defectId] }),
  })
}

export function useAdvanceStage() {
  const qc = useQueryClient()
  const { project } = useSession()
  return useMutation({
    mutationFn: ({ apt, stage }: { apt: string; stage: StageName }) =>
      api.stages.advance(project.id, apt, stage),
    // A refused advance writes nothing, so only refresh when one landed.
    onSuccess: (res) => res.ok && invalidate(qc, ['stages', 'apartments']),
  })
}

export function useSetStageAssignee() {
  const qc = useQueryClient()
  const { project } = useSession()
  return useMutation({
    mutationFn: ({ apt, stage, who }: { apt: string; stage: StageName; who: string }) =>
      api.stages.setAssignee(project.id, apt, stage, who),
    onSuccess: () => invalidate(qc, ['stages']),
  })
}

export function useSetTaskColumn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, col }: { id: string; col: TaskColumn }) => api.tasks.setColumn(id, col),
    onSuccess: () => invalidate(qc, ['tasks']),
  })
}

export function useAddTaskComment(taskId: string) {
  const qc = useQueryClient()
  const actor = useActor()
  return useMutation({
    mutationFn: (text: string) => api.tasks.addComment(taskId, actor, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taskComments', taskId] }),
  })
}

export function useSetUserActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ mail, active }: { mail: string; active: boolean }) =>
      api.users.setActive(mail, active),
    onSuccess: () => invalidate(qc, ['users']),
  })
}

export function useResetDemoData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.storage.reset(),
    // Everything changed — drop the whole cache rather than listing keys.
    onSuccess: () => qc.invalidateQueries(),
  })
}
