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
  DEFECT_FLOW, PEOPLE, PROBLEM_CATS, PROJECTS, QA_TEAM, ROOMS, STAGES, SUBS,
  TASK_FLOW, TODAY, progressFromStages, recoFor,
  type Apartment, type ArchiveRow, type Defect,
  type DefectComment, type DefectEvent, type DefectStatus, type DocRow,
  type MailRecipient,
  type Priority, type ProjectId, type Stage, type StageStatus, type Standard,
  type Task, type TaskChecklistItem, type TaskColumn, type TaskComment,
  type TaskEvent, type TaskTrack, type UserRow,
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
// v10 rebuilt the tasks around the request → breakdown → handover workflow:
// project-scoped rows, a real stored checklist, multi-floor locations and
// assignees drawn from QA_TEAM so per-supervisor visibility has something to
// match on. Deadlines and task types are gone.
export const SEED_VERSION = 10

/**
 * Stored rows carry an `ord` so lists come back in generated order rather than
 * IndexedDB's key order, plus a `proj` scope and composite `key` where the
 * natural id is only unique within a project.
 */
export type Ordered<T> = T & { ord: number }
export type AptRow = Ordered<Apartment> & { key: string; proj: ProjectId }
export type DefectRow = Ordered<Defect> & { key: string; proj: ProjectId }
export type StageRow = Ordered<Stage> & { key: string; proj: ProjectId }
export type TaskRow = Ordered<Task> & { proj: ProjectId }
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

/** A hand-added mail recipient. Never seeded, for the same reason. */
export type MailRecipientRow = Ordered<MailRecipient>

/**
 * A field photo. Never seeded — the demo dataset has no real imagery, so these
 * rows only ever come from an inspector's camera or file picker.
 */
export interface PhotoRow {
  id: string
  /**
   * `proj:defectId` — the defect this photo documents. Absent on task photos.
   *
   * IndexedDB skips a record that lacks an index's keyPath, so `by-defect` and
   * `by-task` hold disjoint sets and neither needs a discriminator column.
   */
  defect?: string
  /** The task this photo was posted on. Absent on defect photos. */
  taskId?: string
  /** The comment it was attached to, so the thread can render it in place. */
  commentId?: string
  ord: number
  kind: 'before' | 'after' | 'task'
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

/** ISO stamp `n` days before the demo's today, at `h` o'clock. */
function ago(n: number, h: number): string {
  const d = new Date(`${TODAY}T00:00:00`)
  d.setDate(d.getDate() - n)
  return `${d.toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}:00:00`
}

const nameOf = (id: string) => QA_TEAM.find((m) => m.id === id)!.name

const PMDIR = 'პროექტების მართვის დირექტორი'
const PFM = 'პორტფოლიო მენეჯერი'
const PM = 'პროექტის მენეჯერი'
const TECHDIR = 'ტექნიკური დირექტორი'

/**
 * A seeded task, before the repetitive parts are filled in. The demo needs one
 * row in every state a role can act on, so the shape stays terse and `expand`
 * derives the checklist stamps, the gate and a history consistent with `col`.
 */
interface TaskSeed {
  id: string
  proj: ProjectId
  title: string
  desc: string
  col: TaskColumn
  pri: Priority
  floors: number[]
  apts?: string[]
  /** `QA_TEAM` id. A request is filed unassigned. */
  who?: string
  by: string
  track?: TaskTrack
  parentId?: string
  items?: string[]
  /** How many of `items` the supervisor has ticked. */
  ticked?: number
  /** Whether the supervisor has signed the current step off. */
  ready?: boolean
  /** Display name of whoever vouched technically, if anyone has. */
  techOk?: string
  /** Days before today the task was filed — spaces the history out. */
  age: number
}

function expand(s: TaskSeed): Task {
  const who = s.who ? nameOf(s.who) : ''
  const ticked = s.ticked ?? 0
  const checklist: TaskChecklistItem[] = (s.items ?? []).map((text, i) => ({
    id: `${s.id}-c${i + 1}`,
    text,
    done: i < ticked,
    by: i < ticked ? who : '',
    at: i < ticked ? ago(s.age - 2 - i, 11) : '',
  }))

  // One entry per column the task has already passed through, oldest first.
  const reached = TASK_FLOW.slice(0, TASK_FLOW.indexOf(s.col) + 1)
  const history: TaskEvent[] = reached.map((col, i) => ({
    col,
    at: ago(s.age - i * 2, 9 + i),
    who: col === 'req' ? s.by : col === 'new' ? PM : who || s.by,
  }))

  return {
    id: s.id,
    title: s.title,
    desc: s.desc,
    track: s.track ?? 'main',
    col: s.col,
    pri: s.pri,
    floors: s.floors,
    apts: s.apts ?? [],
    whoId: s.who ?? null,
    who,
    by: s.by,
    ...(s.parentId ? { parentId: s.parentId } : {}),
    checklist,
    gate: {
      ...(s.ready ? { ready: { by: who, at: ago(1, 16) } } : {}),
      ...(s.techOk ? { techOk: { by: s.techOk, at: ago(1, 18) } } : {}),
    },
    history,
  }
}

const TASK_SEEDS: TaskSeed[] = [
  // ── NTB — one row per state worth clicking ────────────────────────────────
  {
    id: 'T-2101', proj: 'NTB', col: 'req', pri: 'high', age: 3, by: PMDIR,
    title: 'მე-14 სართულის ჩაბარებამდე სრული შემოწმება',
    desc: 'ჩააბარეთ მე-14 სართული — მილების გადმოსვლა, ელექტრო კოლოფები და ლესვის ხარისხი. ჩაშალეთ და დაავალეთ ზედამხედველს.',
    floors: [14],
  },
  {
    id: 'T-2102', proj: 'NTB', col: 'req', pri: 'med', age: 2, by: PFM,
    title: 'ფასადის მოპირკეთების შერჩევითი კონტროლი — მე-9 და მე-10',
    desc: 'პორტფელის კვარტალურ მიმოხილვამდე გვჭირდება ფასადის ფოტოფიქსაცია ორივე სართულზე.',
    floors: [9, 10],
  },
  {
    id: 'T-2103', proj: 'NTB', col: 'new', pri: 'med', age: 6, by: PM, who: 'guji',
    title: 'კერამოგრანიტის შემოწმება — დერეფანი',
    desc: 'დერეფნის იატაკის ფილა — ღრეჩოები, სიბრტყე და კუთხეების დამუშავება.',
    floors: [10], apts: ['1004', '1005'],
    items: ['ვიზუალური დათვალიერება', 'ღრეჩოს გაზომვა (≤2 მმ)', 'ფოტოფიქსაცია'],
  },
  {
    id: 'T-2104', proj: 'NTB', col: 'new', pri: 'med', age: 5, by: PM, who: 'paata',
    title: 'ლიფტის კარებების მონტაჟის შემოწმება',
    desc: 'ორივე შახტაზე — კარების ვერტიკალი, ღრეჩო და ჩამკეტის მუშაობა.',
    floors: [5],
    items: ['ვერტიკალის შემოწმება', 'ღრეჩოს გაზომვა', 'ჩამკეტის ტესტი', 'ფოტოფიქსაცია'],
  },
  {
    id: 'T-2105', proj: 'NTB', col: 'prog', pri: 'high', age: 9, by: PM, who: 'guji',
    title: 'შავი ბლოკის წყობის შემოწმება',
    desc: 'წყობის ვერტიკალი და ხსნარის სისქე სტანდარტთან შედარებით.',
    floors: [17], apts: ['1702', '1703', '1706'],
    items: ['ვერტიკალის გაზომვა', 'ხსნარის სისქე', 'ბლოკის მარკის დადასტურება', 'ფოტოფიქსაცია'],
    ticked: 2,
  },
  {
    id: 'T-2106', proj: 'NTB', col: 'prog', pri: 'high', age: 11, by: PM, who: 'paata',
    title: 'ელექტრო კოლოფების რაოდენობისა და პოზიციის შემოწმება',
    desc: 'პროექტთან შედარება ბინა-ბინა; ყველა გადახრა დააფიქსირეთ ფოტოთი.',
    floors: [11], apts: ['1101', '1102', '1103'],
    items: ['პროექტთან შედარება', 'პოზიციის გაზომვა', 'ფოტოფიქსაცია'],
    ticked: 3, ready: true,
  },
  {
    id: 'T-2107', proj: 'NTB', col: 'check', pri: 'high', age: 14, by: PM, who: 'guji',
    title: 'მილების გადმოსვლის (10 სმ) შემოწმება',
    desc: 'ჰაერსატარი, კანალიზაცია და წყალგაყვანილობა — გადმოსვლა 10 სმ-ზე.',
    floors: [14], apts: ['1418'],
    items: ['ჰაერსატარის გაზომვა', 'კანალიზაციის გაზომვა', 'წყალგაყვანილობის გაზომვა', 'აქტის მომზადება'],
    ticked: 4, ready: true,
  },
  {
    id: 'T-2108', proj: 'NTB', col: 'check', pri: 'med', age: 16, by: PM, who: 'paata',
    title: 'აივნის ფასადების შემოწმება',
    desc: 'აივნების მოპირკეთება და ჰიდროიზოლაციის კიდეები.',
    floors: [9],
    items: ['ვიზუალური დათვალიერება', 'ჰიდროიზოლაციის კიდეები', 'ფოტოფიქსაცია'],
    ticked: 3, ready: true, techOk: TECHDIR,
  },
  {
    id: 'T-2109', proj: 'NTB', col: 'done', pri: 'med', age: 22, by: PM, who: 'guji',
    title: 'MEP — დაქსელილი წყლის მილების ტესტირების ჩაბარება',
    desc: 'წნევის ტესტი და ჩაბარების აქტი.',
    floors: [8],
    items: ['წნევის ტესტი', 'ჟურნალის შევსება', 'აქტის მომზადება'],
    ticked: 3, techOk: TECHDIR,
  },
  {
    id: 'T-2110', proj: 'NTB', col: 'prog', pri: 'high', age: 7, by: TECHDIR, who: 'daniel',
    track: 'tech',
    title: 'MEP პროექტის ცვლილების ადგილზე გადამოწმება',
    desc: 'rev. C-ის მიხედვით შეადარეთ ფაქტობრივი დაქსელვა და მოამზადეთ დასკვნა.',
    floors: [11, 12],
    items: ['rev. C-სთან შედარება', 'გადახრების აღრიცხვა', 'დასკვნის მომზადება'],
    ticked: 1,
  },
  // Two sub-tasks broken out of T-2105, assigned to a second supervisor.
  {
    id: 'T-2111', proj: 'NTB', col: 'new', pri: 'med', age: 4, by: PM, who: 'paata',
    parentId: 'T-2105',
    title: 'წყობის ხსნარის ლაბორატორიული სინჯი — მე-17',
    desc: 'აიღეთ სინჯი და გადაეცით ლაბორატორიას.',
    floors: [17], apts: ['1702'],
    items: ['სინჯის აღება', 'ლაბორატორიაში გადაცემა'],
  },
  {
    id: 'T-2112', proj: 'NTB', col: 'prog', pri: 'low', age: 4, by: PM, who: 'guji',
    parentId: 'T-2105',
    title: 'ბლოკის მარკის დოკუმენტაციის შემოწმება',
    desc: 'მიმწოდებლის სერტიფიკატი და მარკის შესაბამისობა.',
    floors: [17],
    items: ['სერტიფიკატის მოძიება', 'მარკის შედარება'],
    ticked: 1,
  },
  // ── SBP ───────────────────────────────────────────────────────────────────
  {
    id: 'T-2201', proj: 'SBP', col: 'req', pri: 'med', age: 3, by: PFM,
    title: 'მე-12 სართულის ლესვის ხარისხის მიმოხილვა',
    desc: 'პორტფელის მიმოხილვისთვის საჭიროა ინტერიერის ლესვის შერჩევითი კონტროლი.',
    floors: [12],
  },
  {
    id: 'T-2202', proj: 'SBP', col: 'prog', pri: 'high', age: 8, by: PM, who: 'guji',
    title: 'ჰიდროსაიზოლაციო სამუშაოების მიღება — სველი წერტილები',
    desc: 'წყალშეკავების ტესტი და კიდეების დამუშავება.',
    floors: [7], apts: ['703', '704'],
    items: ['წყალშეკავების ტესტი', 'კიდეების შემოწმება', 'ფოტოფიქსაცია'],
    ticked: 2,
  },
  // ── BTM ───────────────────────────────────────────────────────────────────
  {
    id: 'T-2301', proj: 'BTM', col: 'new', pri: 'med', age: 5, by: PM, who: 'paata',
    title: 'ბაზალტის ფილით მოპირკეთების შემოწმება — ცოკოლი',
    desc: 'ფილის ჯდომა, ღრეჩო და წებოცემენტის ხარისხი.',
    floors: [1],
    items: ['ვიზუალური დათვალიერება', 'ღრეჩოს გაზომვა', 'ფოტოფიქსაცია'],
  },
  {
    id: 'T-2302', proj: 'BTM', col: 'check', pri: 'med', age: 13, by: TECHDIR, who: 'daniel',
    track: 'tech',
    title: 'წყლის სატუმბი სადგურის ექსპლუატაციაში მიღება',
    desc: 'ინსტრუქციის მიხედვით გაუშვით და დააფიქსირეთ პარამეტრები.',
    floors: [1],
    items: ['გაშვების ტესტი', 'პარამეტრების ჩაწერა', 'ჟურნალის შევსება'],
    ticked: 3, ready: true,
  },
]

const TASKS: (Task & { proj: ProjectId })[] = TASK_SEEDS.map((s) => ({
  ...expand(s),
  proj: s.proj,
}))

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
