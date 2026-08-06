// Deterministic demo dataset, generated once and written into IndexedDB.
//
// Previously this file *was* the database — every read re-derived rows from a
// stable string hash. Now it only produces the initial contents; after seeding,
// the store is the source of truth and edits made in the app survive reloads.
// The hashes stay so a fresh install (or a reset) always yields the same demo
// project the prototype was approved against.
//
// Bump SEED_VERSION whenever a generator below changes — `ensureSeeded` wipes
// and re-seeds when the stored version no longer matches.

import { hash01 } from '@/lib/utils'
import type { Annotation } from '@/lib/annotate'
import {
  DEFECT_FLOW, PEOPLE, PROBLEM_CATS, PROJECTS, ROOMS, STAGES, SUBS, TASK_TYPES,
  progressFromStages, recoFor,
  type Apartment, type ArchiveRow, type Defect,
  type DefectComment, type DefectEvent, type DefectStatus, type DocRow,
  type Priority, type ProjectId, type Stage, type StageStatus, type Standard,
  type Task, type TaskComment, type UserRow,
} from '@/data/domain'
import { STANDARD_INDEX } from '@/data/standards-index'
import type { WriteOp } from './idb'
import type { StoreName } from './schema'

// v2 dropped the pre-written task comments — comments are hand-authored only.
// v3 gave every seeded defect its own status history instead of one shared set
// of dates hardcoded in the dialog.
// v4 added the per-apartment stage rows that `prog` and `late` now read from.
// v5 moved defects onto the site's own two-level taxonomy — a Georgian
// პრობლემის კატეგორია plus a ჯგუფი — replacing the flat English category list.
// v6 replaced the eight placeholder standards with the 28 real TEC documents.
// v7 narrowed the archive to the documents the site actually files —
// ხელშეკრულება, აქტი and ჯარიმა — dropping invoices, expert reports and policies.
// v8 dropped the contracts and audit-log datasets along with those modules.
// v9 dropped the owner-portal documents and the two retired role accounts.
export const SEED_VERSION = 9

/**
 * Stored rows carry an `ord` so lists come back in generated order rather than
 * IndexedDB's key order, plus a `proj` scope and composite `key` where the
 * natural id is only unique within a project.
 */
export type Ordered<T> = T & { ord: number }
export type AptRow = Ordered<Apartment> & { key: string; proj: ProjectId }
export type DefectRow = Ordered<Defect> & { key: string; proj: ProjectId }
export type StageRow = Ordered<Stage> & { key: string; proj: ProjectId }
export type TaskRow = Ordered<Task>
export type StandardRow = Ordered<Standard>
export type DocumentRow = Ordered<DocRow>
export type ArchiveDocRow = Ordered<ArchiveRow>
export type UserAccountRow = Ordered<UserRow>

/**
 * Comments, on a task or on a defect. Never seeded: a comment is somebody's
 * word, so the only rows that exist are the ones a user typed in the app.
 */
export type TaskCommentRow = Ordered<TaskComment>
export type DefectCommentRow = Ordered<DefectComment>

/**
 * A field photo. Never seeded — the demo dataset has no real imagery, so these
 * rows only ever come from an inspector's camera or file picker.
 */
export interface PhotoRow {
  id: string
  /** `proj:defectId` — the defect this photo documents. */
  defect: string
  ord: number
  kind: 'before' | 'after'
  name: string
  /** ISO timestamp of when the photo was attached. */
  at: string
  source: 'camera' | 'upload'
  w: number
  h: number
  /**
   * The encoded image, annotations already burned in.
   *
   * Bytes, not a Blob: WebKit's IndexedDB mishandles stored Blobs — the write
   * transaction either fails outright or never settles, so on iOS a save hangs
   * forever. An ArrayBuffer round-trips everywhere.
   */
  bytes: ArrayBuffer
  /** MIME type, needed to rebuild the Blob on read. */
  type: string
  /** The marks that produced `bytes`, kept as data so a report can list them and
   *  a later screen could re-render or re-edit them. */
  annotations?: Annotation[]
  /** Rows written before photos were stored as bytes. Read-only legacy. */
  blob?: Blob
}

export const aptKey = (proj: ProjectId, no: string) => `${proj}:${no}`
export const defectKey = (proj: ProjectId, id: string) => `${proj}:${id}`
export const stageKey = (proj: ProjectId, apt: string, stage: string) => `${proj}:${apt}:${stage}`

// ---------------------------------------------------------------- apartments

function generateProject(
  proj: ProjectId,
): { apartments: AptRow[]; defects: DefectRow[]; stages: StageRow[] } {
  const top = proj === 'NTB' ? 21 : 16
  const perFloor = (f: number) => (proj === 'NTB' ? (f === 14 ? 18 : 17) : 8)
  const apartments: AptRow[] = []
  const defects: DefectRow[] = []
  const stages: StageRow[] = []

  for (let f = top; f >= 1; f--) {
    for (let i = 1; i <= perFloor(f); i++) {
      const no = `${f}${String(i).padStart(2, '0')}`
      const k = proj + no
      // How far up the building this unit is — the shape of the original demo
      // curve. It seeds the stage statuses; the stored `prog` is then read back
      // off those stages, so the two can never drift apart.
      const reach = Math.max(0, Math.min(100, Math.round(104 - (f - 1) * (top === 21 ? 4.6 : 5.8) + hash01(k) * 16)))
      const count = reach > 96 || reach < 8 ? 0 : Math.floor(hash01(k + 'd') * 4.4)
      const rows = generateDefects(proj, no, count, defects.length)
      defects.push(...rows)

      const stageRows = generateStages(proj, no, reach, stages.length)
      stages.push(...stageRows)

      apartments.push({
        key: aptKey(proj, no),
        proj,
        ord: apartments.length,
        no,
        floor: f,
        // Open defects, kept in sync by the client on every defect mutation —
        // closing the last one clears the apartment's marker on the map.
        defects: rows.filter((d) => d.st !== 'დახურული').length,
        prog: progressFromStages(stageRows.map((s) => s.st)),
        sold: hash01(k + 's') > 0.55,
        late: stageRows.some((s) => s.st === 'Delayed'),
        area: 44 + Math.round(hash01(k + 'a') * 52),
        rooms: 1 + Math.round(hash01(k + 'r') * 2),
      })
    }
  }
  return { apartments, defects, stages }
}

/**
 * Stage rows for one apartment. `reach` places the frontier: everything below
 * it is accepted, the stage at it is under way, and the one after it has
 * occasionally stalled.
 */
function generateStages(proj: ProjectId, no: string, reach: number, baseOrd: number): StageRow[] {
  const frontier = Math.round((reach / 100) * STAGES.length)
  return STAGES.map((stage, i) => {
    const k = proj + no + stage
    let st: StageStatus
    if (i < frontier) st = 'Completed'
    else if (i === frontier) st = 'In Progress'
    else if (i === frontier + 1 && hash01(k + 'x') > 0.85) st = 'Delayed'
    else st = 'Not Started'

    const moved = st !== 'Not Started'
    return {
      key: stageKey(proj, no, stage),
      proj,
      ord: baseOrd + i,
      apt: no,
      stage,
      st,
      who: moved ? PEOPLE[Math.floor(hash01(k + 'w') * PEOPLE.length)]! : '',
      at: moved
        ? `2026-${String(4 + Math.floor(hash01(k + 'm') * 4)).padStart(2, '0')}-${String(1 + Math.floor(hash01(k + 'd') * 27)).padStart(2, '0')}`
        : '',
    }
  })
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` shifted by whole days, as a local ISO stamp. */
function shift(date: string, days: number, hour: number, minute: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(hour)}:${pad2(minute)}:00`
}

/**
 * The stamps a seeded defect collected on its way to its current status,
 * counted back from its own deadline. Hash-derived like everything else here,
 * so each demo record carries its own dates instead of one shared set.
 */
function generateHistory(k: string, row: Defect): DefectEvent[] {
  // Filed 9–16 days before the deadline, then worked through the flow.
  const filed = -(9 + Math.floor(hash01(k + 'h') * 8))
  const steps: [DefectStatus, number, string][] = [
    ['ღია', filed, row.who],
    ['მიმდინარე', filed + 1 + Math.floor(hash01(k + 'h1') * 2), row.who],
    ['შემოწმებაზე', filed + 4 + Math.floor(hash01(k + 'h2') * 4), row.sub],
    // Starts past the previous stage's latest day, so the strip always reads
    // forward in time whichever days the hash picks.
    ['დახურული', filed + 8 + Math.floor(hash01(k + 'h3') * 4), row.who],
  ]
  return steps.slice(0, DEFECT_FLOW.indexOf(row.st) + 1).map(([st, days, who], i) => ({
    st,
    at: shift(row.due, days, 8 + Math.floor(hash01(k + 'ht' + i) * 9), Math.floor(hash01(k + 'hm' + i) * 60)),
    who,
  }))
}

function generateDefects(proj: ProjectId, no: string, count: number, baseOrd: number): DefectRow[] {
  const out: DefectRow[] = []
  for (let i = 0; i < count; i++) {
    const k = proj + no + 'q' + i
    const entry = PROBLEM_CATS[Math.floor(hash01(k + 'c') * PROBLEM_CATS.length)]!
    const cat = entry.cat
    // Categories without a second level file against the bare category.
    const groups: readonly string[] = entry.groups
    const group = groups.length ? groups[Math.floor(hash01(k + 'g') * groups.length)] : undefined
    const id = `QA-${no}-${String(17 + i * 4).padStart(3, '0')}`
    const row: DefectRow = {
      key: defectKey(proj, id),
      proj,
      ord: baseOrd + i,
      id,
      cat,
      ...(group ? { group } : {}),
      apt: no,
      room: ROOMS[Math.floor(hash01(k + 'r') * 5)]!,
      pri: (['high', 'med', 'low'] as Priority[])[Math.floor(hash01(k + 'p') * 3)]!,
      st: (['ღია', 'მიმდინარე', 'შემოწმებაზე', 'დახურული'] as const)[Math.floor(hash01(k + 's') * 4)]!,
      who: PEOPLE[Math.floor(hash01(k + 'w') * PEOPLE.length)]!,
      sub: SUBS[Math.floor(hash01(k + 'u') * 4)]!,
      due: `2026-0${7 + Math.floor(hash01(k + 'd') * 2)}-${String(4 + Math.floor(hash01(k + 'e') * 22)).padStart(2, '0')}`,
      // The corrective measure the filing form would have proposed for this
      // category — the same text a real filing starts from.
      desc: recoFor(cat),
    }
    out.push({ ...row, history: generateHistory(k, row) })
  }
  return out
}

// ------------------------------------------------------------- static tables

const TASKS: Task[] = [
  { id: 'T-2101', title: 'კერამოგრანიტის შემოწმება — დერეფანი', loc: 'მე-10 სართ.', who: 'თ. აბულაძე', due: '12 აგვ', col: 'new', pri: 'med', floor: 10, type: 'კერამოგრანიტის შემოწმება' },
  { id: 'T-2102', title: 'ლიფტის კარებების მონტაჟის შემოწმება', loc: 'მე-5 სართ.', who: 'ზ. ხურციძე', due: '10 აგვ', col: 'new', pri: 'med', floor: 5, type: 'ლიფტის მონტაჟის შემოწმება' },
  { id: 'T-2103', title: 'შავი ბლოკის წყობის შემოწმება', loc: 'მე-17 სართ.', who: 'ლ. ჩხეიძე', due: '15 აგვ', col: 'prog', pri: 'high', floor: 17, type: 'წყობის შემოწმება' },
  { id: 'T-2104', title: 'ელექტროობის კაბელების დაქსელვის შემოწმება', loc: 'მე-11 სართ.', who: 'ი. მაისურაძე', due: '30 ივლ', col: 'prog', pri: 'high', floor: 11, type: 'ელექტროობის შემოწმება' },
  { id: 'T-2105', title: 'ელექტრო კოლოფების რაოდენობის შემოწმება', loc: 'მე-11 სართ.', who: 'ი. მაისურაძე', due: '11 აგვ', col: 'prog', pri: 'med', floor: 11, type: 'ელექტროობის შემოწმება' },
  { id: 'T-2108', title: 'ჰაერსატარების, კანალიზაციისა და წყალგაყვანილობის მილების გადმოსვლის (10 სმ) შემოწმება', loc: 'მე-14 · 18 ბინა', who: 'გ. კვარაცხელია', due: '08 აგვ', col: 'prog', pri: 'high', floor: 14, type: TASK_TYPES[1]! },
  { id: 'T-2106', title: 'აივნის ფასადების შემოწმება', loc: 'მე-9 სართ.', who: 'გ. კვარაცხელია', due: '05 აგვ', col: 'check', pri: 'med', floor: 9, type: 'ფასადის შემოწმება' },
  { id: 'T-2107', title: 'MEP — დაქსელილი წყლის მილების ტესტირების ჩაბარება', loc: 'მე-8 სართ.', who: 'ი. მაისურაძე', due: '30 ივლ', col: 'done', pri: 'med', floor: 8, type: 'MEP ტესტირება' },
]

// The card list for the real TEC documents. Only what the card shows is seeded;
// the body text lives in `standards-content` and is read straight from there by
// the document page, so it never rides along in the initial bundle.
const STANDARDS: Standard[] = STANDARD_INDEX

const DRAWINGS: DocRow[] = [
  { code: 'AR-101', name: 'არქიტექტურა — გეგმები, კორპუსი A', meta: 'DWG + PDF · 214 ფურც.', rev: 'rev. D', st: 'დამტკიცებული' },
  { code: 'AR-102', name: 'არქიტექტურა — ფასადები', meta: 'PDF · 48 ფურც.', rev: 'rev. C', st: 'დამტკიცებული' },
  { code: 'KJ-201', name: 'კონსტრუქციული — კარკასი', meta: 'DWG · 156 ფურც.', rev: 'rev. E', st: 'დამტკიცებული' },
  { code: 'MEP-E-09', name: 'ელექტროობა', meta: 'DWG · 64 ფურც.', rev: 'rev. C', st: 'განხილვაში' },
  { code: 'MEP-P-04', name: 'სანტექნიკა — სადგამები', meta: 'PDF · 38 ფურც.', rev: 'rev. B', st: 'დამტკიცებული' },
  { code: 'HVAC-02', name: 'ვენტილაცია — საერთო ზონები', meta: 'DWG · 29 ფურც.', rev: 'rev. B', st: 'გადამუშავებაზე' },
  { code: 'FF-01', name: 'სახანძრო უსაფრთხოება', meta: 'PDF · 52 ფურც.', rev: 'rev. A', st: 'დამტკიცებული' },
  { code: 'LS-01', name: 'კეთილმოწყობა / ლანდშაფტი', meta: 'PDF · 18 ფურც.', rev: 'rev. A', st: 'განხილვაში' },
]

const ARCHIVE: ArchiveRow[] = [
  { id: 'ARC-01', ext: 'PDF', name: 'ხელშეკრულება — შპს ალიანს-მშენი', meta: 'ხელშეკრულება · 12 მარ 2026', amt: '$412,000', st: 'ძალაშია' },
  { id: 'ARC-02', ext: 'PDF', name: 'ხელშეკრულება — შპს ტექნო-ინსტალაცია', meta: 'ხელშეკრულება · 02 აპრ 2026', amt: '$268,500', st: 'ძალაშია' },
  { id: 'ARC-03', ext: 'PDF', name: 'ფარული სამუშაოების აქტი — B-0405', meta: 'აქტი · 18 ივლ 2026', amt: '—', st: 'ხელმოწერილი' },
  { id: 'ARC-04', ext: 'XLS', name: 'შესრულებული სამუშაოს აქტი №14', meta: 'აქტი · 25 ივლ 2026', amt: '$96,400', st: 'განხილვაში' },
  { id: 'ARC-05', ext: 'PDF', name: 'ჯარიმა — შპს ალიანს-მშენი · ვადის დარღვევა', meta: 'ჯარიმა · 22 ივლ 2026', amt: '$8,400', st: 'გამოწერილი' },
  { id: 'ARC-06', ext: 'PDF', name: 'ჯარიმა — შპს ტექნო-ინსტალაცია · ხარისხის შენიშვნა', meta: 'ჯარიმა · 29 ივლ 2026', amt: '$3,150', st: 'გადახდილი' },
]

const USERS: UserRow[] = [
  { ini: 'ნბ', name: 'ნინო ბერიძე', mail: 'n.beridze@company.ge', role: 'პროექტის მენეჯერი', scope: 'VKR · SBP', active: true },
  { ini: 'გკ', name: 'გიორგი კვარაცხელია', mail: 'g.kvara@company.ge', role: 'ზედამხედველი', scope: 'VKR', active: true },
  { ini: 'თა', name: 'თემურ აბულაძე', mail: 't.abuladze@company.ge', role: 'ტექ. დირექტორი', scope: 'ყველა', active: true },
]

// -------------------------------------------------------------------- seeding

const withOrd = <T,>(rows: T[]): Ordered<T>[] => rows.map((r, ord) => ({ ...r, ord }))

const puts = (store: StoreName, rows: unknown[]): WriteOp<StoreName>[] =>
  rows.map((put) => ({ store, put }))

/** Every record of the initial dataset, as one flat list of write ops. */
export function seedRecords(): WriteOp<StoreName>[] {
  const apartments: AptRow[] = []
  const defects: DefectRow[] = []
  const stages: StageRow[] = []
  for (const p of PROJECTS) {
    const generated = generateProject(p.id)
    apartments.push(...generated.apartments)
    defects.push(...generated.defects)
    stages.push(...generated.stages)
  }

  return [
    ...puts('apartments', apartments),
    ...puts('defects', defects),
    ...puts('stages', stages),
    ...puts('tasks', withOrd(TASKS)),
    ...puts('standards', withOrd(STANDARDS)),
    ...puts('drawings', withOrd(DRAWINGS)),
    ...puts('archive', withOrd(ARCHIVE)),
    ...puts('users', withOrd(USERS)),
  ]
}
