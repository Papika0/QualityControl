import { queryOptions } from '@tanstack/react-query'
import type { ProjectId } from '@/data/domain'
import { api } from './client'

export const apartmentsQuery = (proj: ProjectId) =>
  queryOptions({
    queryKey: ['apartments', proj],
    queryFn: () => api.apartments.list(proj),
  })

export const apartmentQuery = (proj: ProjectId, no: string) =>
  queryOptions({
    queryKey: ['apartments', proj, no],
    queryFn: () => api.apartments.get(proj, no),
  })

export const defectsQuery = (proj: ProjectId) =>
  queryOptions({
    queryKey: ['defects', proj],
    queryFn: () => api.defects.list(proj),
  })

export const aptDefectsQuery = (proj: ProjectId, no: string) =>
  queryOptions({
    queryKey: ['defects', proj, no],
    queryFn: () => api.defects.forApartment(proj, no),
  })

export const defectPhotosQuery = (proj: ProjectId, id: string) =>
  queryOptions({
    queryKey: ['defectPhotos', proj, id],
    queryFn: () => api.defects.photos(proj, id),
  })

export const tasksQuery = () =>
  queryOptions({ queryKey: ['tasks'], queryFn: () => api.tasks.list() })

export const taskCommentsQuery = (taskId: string) =>
  queryOptions({ queryKey: ['taskComments', taskId], queryFn: () => api.tasks.comments(taskId) })

export const standardsQuery = () =>
  queryOptions({ queryKey: ['standards'], queryFn: () => api.standards.list() })

export const drawingsQuery = (owner: boolean) =>
  queryOptions({
    queryKey: ['drawings', owner],
    queryFn: () => (owner ? api.docs.ownerDocs() : api.docs.drawings()),
  })

export const archiveQuery = () =>
  queryOptions({ queryKey: ['archive'], queryFn: () => api.docs.archive() })

export const contractsQuery = () =>
  queryOptions({ queryKey: ['contracts'], queryFn: () => api.finance.contracts() })

export const auditQuery = () =>
  queryOptions({ queryKey: ['audit'], queryFn: () => api.audit.list() })

export const usersQuery = () =>
  queryOptions({ queryKey: ['users'], queryFn: () => api.users.list() })

export const storageQuery = () =>
  queryOptions({ queryKey: ['storage'], queryFn: () => api.storage.isPersistent(), staleTime: Infinity })
