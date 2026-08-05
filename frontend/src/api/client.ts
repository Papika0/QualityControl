// API client, backed by IndexedDB (see ./schema and ./idb). The function
// signatures mirror the future Elysia + Eden Treaty client one-to-one, so
// swapping in `treaty<App>(...)` later only touches this file.
//
// Reads return plain domain objects; the storage-only fields (`key`, `proj`,
// `ord`) ride along harmlessly. Writes go through `backend.write`, which lands
// every op of a mutation — the record, the derived apartment count, the audit
// entry — in a single transaction.

import {
  TODAY,
  type Apartment, type ArchiveRow, type ContractRow, type Defect, type DefectStatus,
  type DocRow, type Priority, type ProjectId, type Standard, type Task,
  type TaskColumn, type TaskComment, type UserRow,
} from '@/data/domain'
import type { Backend, WriteOp } from './idb'
import { db, resetDatabase, type StoreName } from './schema'
import {
  aptKey, defectKey,
  type AptRow, type ArchiveDocRow, type AuditEntryRow, type ContractDocRow,
  type DefectRow, type DocumentRow, type StandardRow, type TaskCommentRow,
  type TaskRow, type UserAccountRow,
} from './seed'

type Op = WriteOp<StoreName>

const byOrd = <T extends { ord: number }>(rows: T[]): T[] => rows.sort((a, b) => a.ord - b.ord)

const nextOrd = (rows: { ord: number }[]): number =>
  rows.reduce((max, r) => Math.max(max, r.ord), -1) + 1

/**
 * Sort key that lands *before* every existing row — `ord` is a display-order
 * index, so dropping below the current minimum prepends. Seeded rows keep their
 * generated order and each new defect stacks on top of the previous one.
 */
const prevOrd = (rows: { ord: number }[]): number =>
  rows.reduce((min, r) => Math.min(min, r.ord), 0) - 1

const pad2 = (n: number) => String(n).padStart(2, '0')

const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

/** Audit log stamp: `YYYY-MM-DD HH:mm`, which sorts lexicographically. */
function stamp(d: Date): string {
  return `${isoDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function newId(prefix: string): string {
  const rand =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${rand.replace(/-/g, '').slice(0, 10)}`
}

/** Builds the audit-log op that accompanies a mutation. */
async function auditOp(
  backend: Backend<StoreName>,
  action: string,
  detail: string,
  who: string,
): Promise<Op> {
  const existing = await backend.getAll<AuditEntryRow>('audit')
  const entry: AuditEntryRow = {
    id: newId('LOG'),
    ord: nextOrd(existing),
    t: stamp(new Date()),
    action,
    detail,
    who,
  }
  return { store: 'audit', put: entry }
}

/**
 * An apartment's `defects` field mirrors its open-defect count, so the map and
 * dashboard stay honest after a defect is filed or closed.
 */
async function recountOp(
  backend: Backend<StoreName>,
  proj: ProjectId,
  aptNo: string,
  defects: DefectRow[],
): Promise<Op[]> {
  const apt = await backend.get<AptRow>('apartments', aptKey(proj, aptNo))
  if (!apt) return []
  const open = defects.filter((d) => d.apt === aptNo && d.st !== 'დახურული').length
  return open === apt.defects ? [] : [{ store: 'apartments', put: { ...apt, defects: open } }]
}

export interface NewDefectInput {
  apt: string
  room: string
  cat: string
  pri: Priority
  sub: string
  /** QA inspector filing the defect. */
  who: string
  desc: string
}

export const api = {
  apartments: {
    async list(proj: ProjectId): Promise<Apartment[]> {
      const backend = await db()
      return byOrd(await backend.getAll<AptRow>('apartments', 'by-project', proj))
    },
    async get(proj: ProjectId, no: string): Promise<Apartment | null> {
      const backend = await db()
      return (await backend.get<AptRow>('apartments', aptKey(proj, no))) ?? null
    },
  },

  defects: {
    async list(proj: ProjectId): Promise<Defect[]> {
      const backend = await db()
      return byOrd(await backend.getAll<DefectRow>('defects', 'by-project', proj))
    },

    async forApartment(proj: ProjectId, no: string): Promise<Defect[]> {
      const backend = await db()
      return byOrd(await backend.getAll<DefectRow>('defects', 'by-apartment', [proj, no]))
    },

    async create(proj: ProjectId, input: NewDefectInput, actor: string): Promise<Defect> {
      const backend = await db()
      const all = await backend.getAll<DefectRow>('defects', 'by-project', proj)
      const forApt = all.filter((d) => d.apt === input.apt)

      // Continue the seeded id rhythm (…-017, -021, -025) past whatever exists.
      const taken = new Set(forApt.map((d) => d.id))
      let n = 17
      while (taken.has(`QA-${input.apt}-${String(n).padStart(3, '0')}`)) n += 4
      const id = `QA-${input.apt}-${String(n).padStart(3, '0')}`

      const row: DefectRow = {
        key: defectKey(proj, id),
        proj,
        // Newest first: a freshly filed defect heads the QA list.
        ord: prevOrd(all),
        id,
        cat: input.cat,
        apt: input.apt,
        room: input.room,
        pri: input.pri,
        st: 'ღია',
        who: input.who,
        sub: input.sub,
        due: addDays(TODAY, 14),
        desc: input.desc,
      }

      await backend.write([
        { store: 'defects', put: row },
        ...(await recountOp(backend, proj, input.apt, [...forApt, row])),
        await auditOp(backend, 'ხარვეზი დარეგისტრირდა', `${id} · ${input.cat} · ბინა ${input.apt}`, actor),
      ])
      return row
    },

    async setStatus(
      proj: ProjectId,
      id: string,
      st: DefectStatus,
      actor: string,
    ): Promise<Defect | null> {
      const backend = await db()
      const current = await backend.get<DefectRow>('defects', defectKey(proj, id))
      if (!current) return null
      const next: DefectRow = { ...current, st }
      const siblings = await backend.getAll<DefectRow>('defects', 'by-apartment', [proj, current.apt])

      await backend.write([
        { store: 'defects', put: next },
        ...(await recountOp(
          backend,
          proj,
          current.apt,
          siblings.map((d) => (d.id === id ? next : d)),
        )),
        await auditOp(backend, 'სტატუსი შეიცვალა', `${id} → ${st}`, actor),
      ])
      return next
    },
  },

  tasks: {
    async list(): Promise<Task[]> {
      const backend = await db()
      return byOrd(await backend.getAll<TaskRow>('tasks'))
    },

    async setColumn(id: string, col: TaskColumn, actor: string): Promise<Task | null> {
      const backend = await db()
      const current = await backend.get<TaskRow>('tasks', id)
      if (!current) return null
      const next: TaskRow = { ...current, col }
      await backend.write([
        { store: 'tasks', put: next },
        await auditOp(backend, 'დავალების სტატუსი შეიცვალა', `${id} · ${current.title}`, actor),
      ])
      return next
    },

    async comments(taskId: string): Promise<TaskComment[]> {
      const backend = await db()
      return byOrd(await backend.getAll<TaskCommentRow>('taskComments', 'by-task', taskId))
    },

    async addComment(taskId: string, who: string, text: string): Promise<TaskComment> {
      const backend = await db()
      const existing = await backend.getAll<TaskCommentRow>('taskComments', 'by-task', taskId)
      const comment: TaskCommentRow = {
        id: newId('CMT'),
        ord: nextOrd(existing),
        taskId,
        who,
        at: new Date().toISOString(),
        text,
      }
      await backend.write([{ store: 'taskComments', put: comment }])
      return comment
    },
  },

  standards: {
    async list(): Promise<Standard[]> {
      const backend = await db()
      return byOrd(await backend.getAll<StandardRow>('standards'))
    },
  },

  docs: {
    async drawings(): Promise<DocRow[]> {
      const backend = await db()
      return byOrd(await backend.getAll<DocumentRow>('drawings'))
    },
    async ownerDocs(): Promise<DocRow[]> {
      const backend = await db()
      return byOrd(await backend.getAll<DocumentRow>('ownerDocs'))
    },
    async archive(): Promise<ArchiveRow[]> {
      const backend = await db()
      return byOrd(await backend.getAll<ArchiveDocRow>('archive'))
    },
  },

  finance: {
    async contracts(): Promise<ContractRow[]> {
      const backend = await db()
      return byOrd(await backend.getAll<ContractDocRow>('contracts'))
    },
  },

  audit: {
    /** Newest first. */
    async list(): Promise<AuditEntryRow[]> {
      const backend = await db()
      const rows = await backend.getAll<AuditEntryRow>('audit')
      return rows.sort((a, b) => (a.t === b.t ? b.ord - a.ord : b.t < a.t ? -1 : 1))
    },
  },

  users: {
    async list(): Promise<UserRow[]> {
      const backend = await db()
      return byOrd(await backend.getAll<UserAccountRow>('users'))
    },

    async setActive(mail: string, active: boolean, actor: string): Promise<UserRow | null> {
      const backend = await db()
      const current = await backend.get<UserAccountRow>('users', mail)
      if (!current) return null
      const next: UserAccountRow = { ...current, active }
      await backend.write([
        { store: 'users', put: next },
        await auditOp(
          backend,
          active ? 'მომხმარებელი გააქტიურდა' : 'მომხმარებელი შეიზღუდა',
          `${current.name} · ${current.role}`,
          actor,
        ),
      ])
      return next
    },
  },

  storage: {
    /** false when IndexedDB was unavailable and the app fell back to memory. */
    async isPersistent(): Promise<boolean> {
      return (await db()).persistent
    },
    /** Wipes every store and regenerates the demo dataset. */
    reset: resetDatabase,
  },
}
