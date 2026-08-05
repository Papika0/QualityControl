// API client. Currently backed by the deterministic mock DB; the function
// signatures mirror the future Elysia + Eden Treaty client one-to-one, so
// swapping in `treaty<App>(...)` later only touches this file.

import type { ProjectId } from '@/data/domain'
import {
  ARCHIVE, AUDIT_LOG, CONTRACTS, DRAWINGS, OWNER_DOCS, STANDARDS, TASKS, USERS,
  defectsForApt, getAllDefects, getApartments,
} from './mock-db'

const LATENCY = 120

function respond<T>(data: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), LATENCY))
}

export const api = {
  apartments: {
    list: (proj: ProjectId) => respond(getApartments(proj)),
    get: (proj: ProjectId, no: string) =>
      respond(getApartments(proj).find((a) => a.no === no) ?? null),
  },
  defects: {
    list: (proj: ProjectId) => respond(getAllDefects(proj)),
    forApartment: (proj: ProjectId, no: string, limit?: number) =>
      respond(defectsForApt(proj, no, limit)),
  },
  tasks: {
    list: () => respond(TASKS),
  },
  standards: {
    list: () => respond(STANDARDS),
  },
  docs: {
    drawings: () => respond(DRAWINGS),
    ownerDocs: () => respond(OWNER_DOCS),
    archive: () => respond(ARCHIVE),
  },
  finance: {
    contracts: () => respond(CONTRACTS),
  },
  audit: {
    list: () => respond(AUDIT_LOG),
  },
  users: {
    list: () => respond(USERS),
  },
}
