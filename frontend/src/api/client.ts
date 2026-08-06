// API client, backed by IndexedDB (see ./schema and ./idb). The function
// signatures mirror the future Elysia + Eden Treaty client one-to-one, so
// swapping in `treaty<App>(...)` later only touches this file.
//
// Reads return plain domain objects; the storage-only fields (`key`, `proj`,
// `ord`) ride along harmlessly. Writes go through `backend.write`, which lands
// every op of a mutation — the record and the derived apartment count — in a
// single transaction.

import {
  STAGE_CATS, TODAY, nextStageStatus, progressFromStages,
  type Apartment, type ArchiveRow, type Defect, type DefectComment,
  type DefectStatus, type DocRow, type MailRecipient, type Priority,
  type ProjectId, type Stage,
  type StageName, type Standard, type Task, type TaskColumn, type TaskComment,
  type UserRow,
} from '@/data/domain'
import type { Annotation } from '@/lib/annotate'
import { normalizeMail } from '@/lib/email'
import { blobBytes } from '@/lib/image'
import type { Backend, WriteOp } from './idb'
import { db, resetDatabase, type StoreName } from './schema'
import {
  aptKey, defectKey, stageKey,
  type AptRow, type ArchiveDocRow,
  type DefectCommentRow, type DefectRow, type DocumentRow,
  type MailRecipientRow, type PhotoRow,
  type StageRow, type StandardRow, type TaskCommentRow, type TaskRow,
  type UserAccountRow,
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

/** Days a newly filed defect gets to be fixed — the deadline the form starts on. */
export const DEFECT_DUE_DAYS = 14

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

function newId(prefix: string): string {
  const rand =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${rand.replace(/-/g, '').slice(0, 10)}`
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

/**
 * A stored photo, handed back with its bytes rebuilt into a Blob so callers
 * work with images the same way they always have.
 */
export interface Photo extends Omit<PhotoRow, 'bytes' | 'type' | 'blob'> {
  blob: Blob
}

function toPhoto(row: PhotoRow): Photo {
  const { bytes, type, blob, ...rest } = row
  // `blob` only appears on rows written before the bytes migration.
  return { ...rest, blob: blob ?? new Blob([bytes], { type: type || 'image/jpeg' }) }
}

/** A photo the inspector attached, already decoded and downscaled by the UI. */
export interface NewPhotoInput {
  id: string
  name: string
  blob: Blob
  w: number
  h: number
  source: 'camera' | 'upload'
  at: string
  /** Marks drawn on the photo before filing. Already burned into `blob`. */
  annotations?: Annotation[]
}

/**
 * An apartment's `prog` and `late` are a read-out of its stage rows, so every
 * stage write refreshes them — the map, the dashboard and the floor averages
 * all read those two fields and would otherwise drift from the tracked truth.
 */
async function stageSyncOp(
  backend: Backend<StoreName>,
  proj: ProjectId,
  aptNo: string,
  stages: StageRow[],
): Promise<Op[]> {
  const apt = await backend.get<AptRow>('apartments', aptKey(proj, aptNo))
  if (!apt) return []
  const prog = progressFromStages(stages.map((s) => s.st))
  const late = stages.some((s) => s.st === 'Delayed')
  if (prog === apt.prog && late === apt.late) return []
  return [{ store: 'apartments', put: { ...apt, prog, late } }]
}

/**
 * The QA gate: open defects a stage answers for. Accepting is refused while
 * this is non-empty. A STAGE_CATS entry is either a category or a single ჯგუფი,
 * so a defect matches on whichever level the stage was written at. Handover
 * maps to `'*'` — it cannot be signed off while the unit has an open defect of
 * any kind.
 */
export function stageBlockers(stage: StageName, defects: Defect[]): Defect[] {
  const cats: readonly string[] = STAGE_CATS[stage]
  const open = defects.filter((d) => d.st !== 'დახურული')
  if (cats.includes('*')) return open
  return open.filter((d) => cats.includes(d.cat) || (d.group != null && cats.includes(d.group)))
}

/** Result of trying to move a stage on. `blockedBy` is only set when refused. */
export interface StageAdvanceResult {
  ok: boolean
  stage: Stage | null
  blockedBy: Defect[]
}

export interface NewDefectInput {
  apt: string
  room: string
  cat: string
  /** The ჯგუფი inside `cat`, when the category has any. */
  group?: string
  /** `Standard.code` the corrective action enforces, when one was picked. */
  standard?: string
  pri: Priority
  sub: string
  /** QA inspector filing the defect. */
  who: string
  /** Deadline as `YYYY-MM-DD`. Omitted falls back to the standard window. */
  due?: string
  desc: string
  /** Evidence attached at filing time. Stored with the defect, in one transaction. */
  photos?: NewPhotoInput[]
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
        ...(input.group ? { group: input.group } : {}),
        ...(input.standard ? { standard: input.standard } : {}),
        apt: input.apt,
        room: input.room,
        pri: input.pri,
        st: 'ღია',
        who: input.who,
        sub: input.sub,
        due: input.due || addDays(TODAY, DEFECT_DUE_DAYS),
        desc: input.desc,
        // The first stamp of the process timeline. Every later status change
        // appends its own, so the dialog never has to invent a date.
        history: [{ st: 'ღია', at: new Date().toISOString(), who: actor }],
      }

      // Decoding to bytes happens up front, before the transaction opens — an
      // await inside a live IndexedDB transaction would auto-close it.
      const photos: PhotoRow[] = await Promise.all(
        (input.photos ?? []).map(async (p, ord) => ({
          id: p.id,
          defect: row.key,
          ord,
          kind: 'before' as const,
          name: p.name,
          at: p.at,
          source: p.source,
          w: p.w,
          h: p.h,
          bytes: await blobBytes(p.blob),
          type: p.blob.type || 'image/jpeg',
          ...(p.annotations?.length ? { annotations: p.annotations } : {}),
        })),
      )

      await backend.write([
        { store: 'defects', put: row },
        ...photos.map((put): Op => ({ store: 'photos', put })),
        ...(await recountOp(backend, proj, input.apt, [...forApt, row])),
      ])
      return row
    },

    /** Field photos for one defect, in the order they were attached. */
    async photos(proj: ProjectId, id: string): Promise<Photo[]> {
      const backend = await db()
      const rows = await backend.getAll<PhotoRow>('photos', 'by-defect', defectKey(proj, id))
      return byOrd(rows).map(toPhoto)
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
      const next: DefectRow = {
        ...current,
        st,
        history: [
          ...(current.history ?? []),
          { st, at: new Date().toISOString(), who: actor },
        ],
      }
      const siblings = await backend.getAll<DefectRow>('defects', 'by-apartment', [proj, current.apt])

      await backend.write([
        { store: 'defects', put: next },
        ...(await recountOp(
          backend,
          proj,
          current.apt,
          siblings.map((d) => (d.id === id ? next : d)),
        )),
      ])
      return next
    },

    /** Discussion on one defect, oldest first. Nothing is seeded here. */
    async comments(proj: ProjectId, id: string): Promise<DefectComment[]> {
      const backend = await db()
      return byOrd(await backend.getAll<DefectCommentRow>('defectComments', 'by-defect', defectKey(proj, id)))
    },

    async addComment(
      proj: ProjectId,
      id: string,
      who: string,
      text: string,
    ): Promise<DefectComment> {
      const backend = await db()
      const defect = defectKey(proj, id)
      const existing = await backend.getAll<DefectCommentRow>('defectComments', 'by-defect', defect)
      const comment: DefectCommentRow = {
        id: newId('CMT'),
        ord: nextOrd(existing),
        defect,
        who,
        at: new Date().toISOString(),
        text,
      }
      await backend.write([{ store: 'defectComments', put: comment }])
      return comment
    },
  },

  stages: {
    async forApartment(proj: ProjectId, no: string): Promise<Stage[]> {
      const backend = await db()
      return byOrd(await backend.getAll<StageRow>('stages', 'by-apartment', [proj, no]))
    },

    /**
     * Moves a stage one step along `STAGE_FLOW`. Acceptance is checked here and
     * not only in the UI: the button can be disabled, but the rule is what makes
     * a Completed stage mean something.
     */
    async advance(proj: ProjectId, apt: string, stage: StageName): Promise<StageAdvanceResult> {
      const backend = await db()
      const current = await backend.get<StageRow>('stages', stageKey(proj, apt, stage))
      if (!current) return { ok: false, stage: null, blockedBy: [] }

      const st = nextStageStatus(current.st)
      if (!st) return { ok: false, stage: current, blockedBy: [] }

      if (st === 'Completed') {
        const defects = await backend.getAll<DefectRow>('defects', 'by-apartment', [proj, apt])
        const blockedBy = stageBlockers(stage, defects)
        if (blockedBy.length) return { ok: false, stage: current, blockedBy }
      }

      const next: StageRow = { ...current, st, at: TODAY }
      const siblings = await backend.getAll<StageRow>('stages', 'by-apartment', [proj, apt])

      await backend.write([
        { store: 'stages', put: next },
        ...(await stageSyncOp(
          backend,
          proj,
          apt,
          siblings.map((s) => (s.stage === stage ? next : s)),
        )),
      ])
      return { ok: true, stage: next, blockedBy: [] }
    },

    /** Records who performed the stage. Crews are not users — this is a label. */
    async setAssignee(
      proj: ProjectId,
      apt: string,
      stage: StageName,
      who: string,
    ): Promise<Stage | null> {
      const backend = await db()
      const current = await backend.get<StageRow>('stages', stageKey(proj, apt, stage))
      if (!current) return null
      const next: StageRow = { ...current, who }
      await backend.write([{ store: 'stages', put: next }])
      return next
    },
  },

  tasks: {
    async list(): Promise<Task[]> {
      const backend = await db()
      return byOrd(await backend.getAll<TaskRow>('tasks'))
    },

    async setColumn(id: string, col: TaskColumn): Promise<Task | null> {
      const backend = await db()
      const current = await backend.get<TaskRow>('tasks', id)
      if (!current) return null
      const next: TaskRow = { ...current, col }
      await backend.write([{ store: 'tasks', put: next }])
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
    async archive(): Promise<ArchiveRow[]> {
      const backend = await db()
      return byOrd(await backend.getAll<ArchiveDocRow>('archive'))
    },
  },

  users: {
    async list(): Promise<UserRow[]> {
      const backend = await db()
      return byOrd(await backend.getAll<UserAccountRow>('users'))
    },

    async setActive(mail: string, active: boolean): Promise<UserRow | null> {
      const backend = await db()
      const current = await backend.get<UserAccountRow>('users', mail)
      if (!current) return null
      const next: UserAccountRow = { ...current, active }
      await backend.write([{ store: 'users', put: next }])
      return next
    },
  },

  /**
   * Addresses added by hand, copied on assignment notices alongside the QA
   * member the defect went to. Nothing here is seeded — every row is one
   * somebody typed.
   */
  recipients: {
    async list(): Promise<MailRecipient[]> {
      const backend = await db()
      return byOrd(await backend.getAll<MailRecipientRow>('recipients'))
    },

    /** Adding an address the list already holds returns that row untouched. */
    async add(mail: string, name?: string): Promise<MailRecipient> {
      const backend = await db()
      const existing = await backend.getAll<MailRecipientRow>('recipients')
      const address = normalizeMail(mail)
      const already = existing.find((r) => r.mail === address)
      if (already) return already

      const row: MailRecipientRow = {
        id: newId('RCP'),
        ord: nextOrd(existing),
        mail: address,
        ...(name?.trim() ? { name: name.trim() } : {}),
      }
      await backend.write([{ store: 'recipients', put: row }])
      return row
    },

    async update(id: string, patch: { mail?: string; name?: string }): Promise<MailRecipient | null> {
      const backend = await db()
      const current = await backend.get<MailRecipientRow>('recipients', id)
      if (!current) return null
      const { name: previous, ...base } = current
      const name = (patch.name ?? previous ?? '').trim()
      const next: MailRecipientRow = {
        ...base,
        mail: patch.mail === undefined ? current.mail : normalizeMail(patch.mail),
        // An emptied name clears the label rather than storing a blank one.
        ...(name ? { name } : {}),
      }
      await backend.write([{ store: 'recipients', put: next }])
      return next
    },

    async remove(id: string): Promise<void> {
      const backend = await db()
      await backend.write([{ store: 'recipients', del: id }])
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
