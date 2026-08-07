// Write hooks. Each one invalidates every query key the write touches; the ones
// that record authorship also name the actor from the current session.

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { DefectStatus, StageName } from '@/data/domain'
import { useSession } from '@/lib/session'
import {
  api,
  type NewDefectInput,
  type NewPhotoInput,
  type NewTaskInput,
  type TaskPatch,
} from './client'

/**
 * Who is writing. Supervisors sign as themselves — tasks are assigned to a
 * person, so a stamp reading only "ზედამხედველი" would not say which one.
 * Falls back to a generic label when a route is somehow rendered logged out.
 */
function useActor(): string {
  const { role, person } = useSession()
  return person?.name ?? role?.name ?? 'უცნობი მომხმარებელი'
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

export function useCreateTask() {
  const qc = useQueryClient()
  const { project } = useSession()
  const actor = useActor()
  return useMutation({
    mutationFn: (input: NewTaskInput) => api.tasks.create(project.id, input, actor),
    onSuccess: () => invalidate(qc, ['tasks']),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  const { project } = useSession()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) =>
      api.tasks.update(project.id, id, patch),
    onSuccess: () => invalidate(qc, ['tasks']),
  })
}

export function useToggleChecklist() {
  const qc = useQueryClient()
  const { project } = useSession()
  const actor = useActor()
  return useMutation({
    mutationFn: ({ id, itemId, done }: { id: string; itemId: string; done: boolean }) =>
      api.tasks.toggleChecklist(project.id, id, itemId, done, actor),
    onSuccess: () => invalidate(qc, ['tasks']),
  })
}

export function useSetTaskReady() {
  const qc = useQueryClient()
  const { project } = useSession()
  const actor = useActor()
  return useMutation({
    mutationFn: ({ id, ready }: { id: string; ready: boolean }) =>
      api.tasks.setReady(project.id, id, ready, actor),
    onSuccess: () => invalidate(qc, ['tasks']),
  })
}

export function useSetTaskTechOk() {
  const qc = useQueryClient()
  const { project } = useSession()
  const actor = useActor()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.tasks.setTechOk(project.id, id, actor),
    onSuccess: () => invalidate(qc, ['tasks']),
  })
}

export function useAdvanceTask() {
  const qc = useQueryClient()
  const { project } = useSession()
  const actor = useActor()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.tasks.advance(project.id, id, actor),
    // A refused advance writes nothing, so only refresh when one landed.
    onSuccess: (res) => res.ok && invalidate(qc, ['tasks']),
  })
}

export function useAddTaskComment(taskId: string) {
  const qc = useQueryClient()
  const actor = useActor()
  return useMutation({
    mutationFn: ({ text, photos }: { text: string; photos?: NewPhotoInput[] }) =>
      api.tasks.addComment(taskId, actor, text, photos),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['taskComments', taskId] }),
        qc.invalidateQueries({ queryKey: ['taskPhotos', taskId] }),
      ]),
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

export function useAddRecipient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ mail, name }: { mail: string; name?: string }) =>
      api.recipients.add(mail, name),
    onSuccess: () => invalidate(qc, ['recipients']),
  })
}

export function useUpdateRecipient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; mail?: string; name?: string }) =>
      api.recipients.update(id, patch),
    onSuccess: () => invalidate(qc, ['recipients']),
  })
}

export function useRemoveRecipient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.recipients.remove(id),
    onSuccess: () => invalidate(qc, ['recipients']),
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
