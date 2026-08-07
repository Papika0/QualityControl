// What the assistant is allowed to look up, and how.
//
// The app has no backend database — everything lives in this browser's
// IndexedDB — so the model cannot be given a connection string and left to it.
// Instead the server sends back tool calls and these executors answer them
// locally, in the same process and through the same `api` the screens use. The
// catalogue of names and argument schemas is the server's half of the pair, in
// `server/chat-tools.ts`; the `ToolName` union is imported from there so a name
// added on one side and forgotten on the other fails the build.
//
// ── The rule this file exists to enforce ────────────────────────────────────
// Tasks are not uniformly visible. A ზედამხედველი sees only their own, never a
// უფროსის მოთხოვნა and never the tech track; `task-perms.ts` decides. Handing
// `api.tasks.list()` straight to the model would route around all of it and
// have the assistant summarise work the user cannot open. So every task read in
// this file goes through `myTasks()` below — never the raw list, never filtered
// after the fact. The actor comes from the session at the call site and is
// never something the model can pass as an argument.
//
// This is consistency, not security: anyone can edit `qc-session` in devtools
// and the topbar switches role freely. But an assistant that contradicts the
// board is worse than no assistant.

import {
  CATS,
  PRI_LABEL,
  STAGES,
  TASK_COL_LABEL,
  TODAY,
  checklistProgress,
  taskLocation,
  type Apartment,
  type Defect,
  type DefectStatus,
  type Priority,
  type ProjectId,
  type Stage,
  type Task,
  type TaskColumn,
  type TaskTrack,
} from '@/data/domain'
import { STANDARD_INDEX } from '@/data/standards-index'
import { searchStandards } from '@/data/standards-search'
import { canCreateRequest, canSeeTask, taskAction, visibleTasks, type TaskActor } from '@/lib/task-perms'
import { api, stageBlockers } from './client'
// Type-only, and `verbatimModuleSyntax` erases it entirely — the server file
// never enters the browser bundle.
import type { ToolName } from '../../server/chat-tools'

export interface ToolContext {
  actor: TaskActor
  proj: ProjectId
}

export type ToolExecutor = (args: Args, ctx: ToolContext) => Promise<unknown>

type Args = Record<string, unknown>

/** Rows past this are dropped — a 500-defect answer helps nobody and the
 *  context window is not free. The count always survives the truncation. */
const MAX_ROWS = 25

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown): boolean => v === true

function limitOf(v: unknown, max = MAX_ROWS): number {
  const n = num(v)
  return n && n > 0 ? Math.min(n, max) : max
}

/** A capped list that still reports how much it stood for. */
function cap<T>(rows: T[], limit = MAX_ROWS) {
  return {
    total: rows.length,
    rows: rows.slice(0, limit),
    ...(rows.length > limit ? { truncated: true } : {}),
  }
}

const isOpen = (d: Defect) => d.st !== 'დახურული'
const isOverdue = (d: Defect) => d.due < TODAY && isOpen(d)

// ── links ───────────────────────────────────────────────────────────────────
// Every row carries the URL that shows it. The model is told to use only links
// that came back from a tool, and `lib/chat.ts` renders anything else as plain
// text — so these are the whole vocabulary of clickable answers.

const q = (params: Record<string, string | number | boolean | undefined>): string => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

const aptLink = (no: string) => `/apartments/${encodeURIComponent(no)}`
const floorLink = (floor: number) => `/map${q({ floor })}`
const defectLink = (id: string) => `/qa${q({ id })}`
const taskLink = (id: string) => `/tasks${q({ id })}`
const standardLink = (code: string) => `/standards/${encodeURIComponent(code)}`

// ── the chokepoint ──────────────────────────────────────────────────────────

/**
 * Every task this actor may see, and the only way this file reads tasks.
 * Anything downstream filters what comes out of here, never `api.tasks.list`.
 */
async function myTasks(ctx: ToolContext): Promise<Task[]> {
  return visibleTasks(ctx.actor, await api.tasks.list(ctx.proj))
}

/**
 * Sub-task counts, from the unfiltered list. Only a count leaves this function,
 * and only `taskAction` consumes it — a request cannot be published until it
 * has been broken down, and that verdict must not change with who is asking.
 */
async function childCounts(proj: ProjectId): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const t of await api.tasks.list(proj)) {
    if (t.parentId) counts.set(t.parentId, (counts.get(t.parentId) ?? 0) + 1)
  }
  return counts
}

// ── row shapes ──────────────────────────────────────────────────────────────

function defectRow(d: Defect) {
  return {
    id: d.id,
    apt: d.apt,
    room: d.room,
    cat: d.cat,
    ...(d.group ? { group: d.group } : {}),
    status: d.st,
    priority: PRI_LABEL[d.pri],
    who: d.who,
    sub: d.sub,
    due: d.due,
    ...(isOverdue(d) ? { overdue: true } : {}),
    link: defectLink(d.id),
  }
}

function taskRow(t: Task) {
  const progress = checklistProgress(t.checklist)
  return {
    id: t.id,
    title: t.title,
    column: TASK_COL_LABEL[t.col],
    track: t.track === 'tech' ? 'ტექნიკური' : 'ძირითადი',
    priority: PRI_LABEL[t.pri],
    location: taskLocation(t),
    who: t.who || 'დაუნიშნავი',
    by: t.by,
    ...(t.checklist.length ? { checklist: `${t.checklist.filter((i) => i.done).length}/${t.checklist.length} (${progress}%)` } : {}),
    ...(t.gate.ready ? { readyBy: t.gate.ready.by } : {}),
    ...(t.gate.techOk ? { techConfirmedBy: t.gate.techOk.by } : {}),
    ...(t.parentId ? { parentId: t.parentId } : {}),
    link: taskLink(t.id),
  }
}

function aptRow(a: Apartment) {
  return {
    no: a.no,
    floor: a.floor,
    progress: a.prog,
    openDefects: a.defects,
    ...(a.late ? { late: true } : {}),
    link: aptLink(a.no),
  }
}

/** Defect counts by status, in flow order — the shape every summary wants. */
function statusCounts(defects: Defect[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of ['ღია', 'მიმდინარე', 'შემოწმებაზე', 'დახურული'] as DefectStatus[]) {
    out[s] = defects.filter((d) => d.st === s).length
  }
  return out
}

// ── executors ───────────────────────────────────────────────────────────────

async function getProjectOverview(_args: Args, ctx: ToolContext) {
  const [apts, defects, tasks] = await Promise.all([
    api.apartments.list(ctx.proj),
    api.defects.list(ctx.proj),
    myTasks(ctx),
  ])

  const open = defects.filter(isOpen)
  const byFloor = new Map<number, Apartment[]>()
  for (const a of apts) byFloor.set(a.floor, [...(byFloor.get(a.floor) ?? []), a])

  const floors = [...byFloor.entries()]
    .map(([floor, units]) => ({
      floor,
      units: units.length,
      avgProgress: Math.round(units.reduce((s, u) => s + u.prog, 0) / units.length),
      openDefects: units.reduce((s, u) => s + u.defects, 0),
      late: units.filter((u) => u.late).length,
      link: floorLink(floor),
    }))
    .sort((a, b) => b.openDefects - a.openDefects || a.avgProgress - b.avgProgress)

  const taskCols: Record<string, number> = {}
  for (const t of tasks) {
    const label = TASK_COL_LABEL[t.col]
    taskCols[label] = (taskCols[label] ?? 0) + 1
  }

  return {
    project: ctx.proj,
    apartments: apts.length,
    avgProgress: apts.length ? Math.round(apts.reduce((s, a) => s + a.prog, 0) / apts.length) : 0,
    completed: apts.filter((a) => a.prog >= 100).length,
    lateApartments: apts.filter((a) => a.late).length,
    defects: {
      total: defects.length,
      open: open.length,
      overdue: defects.filter(isOverdue).length,
      highPriorityOpen: open.filter((d) => d.pri === 'high').length,
      byStatus: statusCounts(defects),
    },
    // Visible to this user only — another role would see different numbers.
    visibleTasks: { total: tasks.length, byColumn: taskCols },
    worstFloors: floors.slice(0, 5),
    link: '/',
  }
}

async function getFloorStatus(args: Args, ctx: ToolContext) {
  const floor = num(args.floor)
  if (floor === undefined) return { error: 'floor არ არის მითითებული' }

  const [apts, defects, tasks] = await Promise.all([
    api.apartments.list(ctx.proj),
    api.defects.list(ctx.proj),
    myTasks(ctx),
  ])

  const units = apts.filter((a) => a.floor === floor)
  if (!units.length) {
    return {
      found: false,
      floor,
      message: `${ctx.proj}-ში ${floor} სართული არ არსებობს`,
      availableFloors: [...new Set(apts.map((a) => a.floor))].sort((a, b) => a - b),
    }
  }

  const nos = new Set(units.map((u) => u.no))
  const floorDefects = defects.filter((d) => nos.has(d.apt))
  const floorTasks = tasks.filter((t) => t.floors.includes(floor))

  return {
    found: true,
    floor,
    units: units.length,
    avgProgress: Math.round(units.reduce((s, u) => s + u.prog, 0) / units.length),
    completed: units.filter((u) => u.prog >= 100).length,
    late: units.filter((u) => u.late).length,
    defects: {
      open: floorDefects.filter(isOpen).length,
      overdue: floorDefects.filter(isOverdue).length,
      highPriorityOpen: floorDefects.filter((d) => isOpen(d) && d.pri === 'high').length,
    },
    apartments: units.map(aptRow),
    tasks: cap(floorTasks.map(taskRow)),
    link: floorLink(floor),
  }
}

async function getApartment(args: Args, ctx: ToolContext) {
  const no = str(args.no)
  if (!no) return { error: 'no არ არის მითითებული' }

  const apt = await api.apartments.get(ctx.proj, no)
  if (!apt) {
    // Numbers are floor + a two-digit index, so a plausible-looking miss is
    // common. Naming the neighbours stops the model guessing one into being.
    const all = await api.apartments.list(ctx.proj)
    const floor = Number(no.slice(0, -2))
    const sameFloor = all.filter((a) => a.floor === floor).map((a) => a.no)
    return {
      found: false,
      no,
      message: `${ctx.proj}-ში ბინა ${no} არ არსებობს`,
      ...(sameFloor.length ? { existingOnThatFloor: sameFloor } : {}),
    }
  }

  const [stages, defects, tasks] = await Promise.all([
    api.stages.forApartment(ctx.proj, no),
    api.defects.forApartment(ctx.proj, no),
    myTasks(ctx),
  ])

  const open = defects.filter(isOpen)
  // The first stage not yet accepted is the one the unit is actually waiting
  // on, and its blockers are the answer to „რა რჩება".
  const order = new Map(STAGES.map((s, i) => [s, i]))
  const pending = [...stages].sort((a, b) => (order.get(a.stage) ?? 0) - (order.get(b.stage) ?? 0))
  const next: Stage | undefined = pending.find((s) => s.st !== 'Completed')

  return {
    found: true,
    no: apt.no,
    floor: apt.floor,
    progress: apt.prog,
    area: apt.area,
    rooms: apt.rooms,
    sold: apt.sold,
    late: apt.late,
    stages: pending.map((s) => ({ stage: s.stage, status: s.st, ...(s.who ? { who: s.who } : {}), ...(s.at ? { at: s.at } : {}) })),
    stagesCompleted: `${stages.filter((s) => s.st === 'Completed').length}/${stages.length}`,
    ...(next
      ? {
          nextStage: next.stage,
          nextStageStatus: next.st,
          // The QA gate, straight from the rule the write path enforces.
          blockedBy: stageBlockers(next.stage, defects).map((d) => ({
            id: d.id,
            cat: d.group ?? d.cat,
            status: d.st,
            link: defectLink(d.id),
          })),
        }
      : { nextStage: null, note: 'ყველა ეტაპი დასრულებულია' }),
    openDefects: cap(open.map(defectRow)),
    tasks: cap(tasks.filter((t) => t.apts.includes(no)).map(taskRow)),
    link: aptLink(no),
  }
}

async function searchDefects(args: Args, ctx: ToolContext) {
  const all = await api.defects.list(ctx.proj)
  const apts = await api.apartments.list(ctx.proj)

  const status = str(args.status) as DefectStatus | undefined
  const priority = str(args.priority) as Priority | undefined
  const cat = str(args.cat)
  const apt = str(args.apt)
  const who = str(args.who)
  const sub = str(args.sub)
  const floor = num(args.floor)

  const floorUnits = floor !== undefined ? new Set(apts.filter((a) => a.floor === floor).map((a) => a.no)) : null

  let rows = all
  if (status) rows = rows.filter((d) => d.st === status)
  if (bool(args.open)) rows = rows.filter(isOpen)
  if (priority) rows = rows.filter((d) => d.pri === priority)
  if (cat) rows = rows.filter((d) => d.cat === cat || d.group === cat)
  if (apt) rows = rows.filter((d) => d.apt === apt)
  if (floorUnits) rows = rows.filter((d) => floorUnits.has(d.apt))
  if (who) rows = rows.filter((d) => d.who === who)
  if (sub) rows = rows.filter((d) => d.sub === sub)
  if (bool(args.overdue)) rows = rows.filter(isOverdue)

  // Most urgent first, so a truncated list keeps what matters.
  const weight: Record<Priority, number> = { high: 0, med: 1, low: 2 }
  rows = [...rows].sort((a, b) => a.due.localeCompare(b.due) || weight[a.pri] - weight[b.pri])

  return {
    ...cap(rows.map(defectRow), limitOf(args.limit)),
    byStatus: statusCounts(rows),
    // The same filters as a URL, so the answer can offer the full list.
    link: `/qa${q({
      st: status,
      pri: priority,
      cat: cat && (CATS as readonly string[]).includes(cat) ? cat : undefined,
      who,
      overdue: bool(args.overdue) || undefined,
    })}`,
  }
}

async function getDefect(args: Args, ctx: ToolContext) {
  const id = str(args.id)
  if (!id) return { error: 'id არ არის მითითებული' }

  const defect = (await api.defects.list(ctx.proj)).find((d) => d.id === id)
  if (!defect) return { found: false, id, message: `ხარვეზი ${id} ${ctx.proj}-ში ვერ მოიძებნა` }

  const comments = await api.defects.comments(ctx.proj, id)

  return {
    found: true,
    ...defectRow(defect),
    desc: defect.desc,
    history: (defect.history ?? []).map((h) => ({ status: h.st, at: h.at, who: h.who })),
    comments: cap(comments.map((c) => ({ who: c.who, at: c.at, text: c.text })), 10),
  }
}

async function listTasks(args: Args, ctx: ToolContext) {
  let rows = await myTasks(ctx)

  const column = str(args.column) as TaskColumn | undefined
  const track = str(args.track) as TaskTrack | undefined
  const who = str(args.who)
  const apt = str(args.apt)
  const floor = num(args.floor)

  if (column) rows = rows.filter((t) => t.col === column)
  if (track) rows = rows.filter((t) => t.track === track)
  if (who) rows = rows.filter((t) => t.who === who)
  if (floor !== undefined) rows = rows.filter((t) => t.floors.includes(floor))
  if (apt) rows = rows.filter((t) => t.apts.includes(apt))
  if (bool(args.mine)) {
    rows = ctx.actor.personId ? rows.filter((t) => t.whoId === ctx.actor.personId) : []
  }

  const byColumn: Record<string, number> = {}
  for (const t of rows) {
    const label = TASK_COL_LABEL[t.col]
    byColumn[label] = (byColumn[label] ?? 0) + 1
  }

  return {
    ...cap(rows.map(taskRow), limitOf(args.limit)),
    byColumn,
    note: 'დავალებას ვადა არ აქვს — მხოლოდ სვეტი და ბარიერები.',
    link: `/tasks${q({ who, floor, track, mine: bool(args.mine) || undefined })}`,
  }
}

async function getTask(args: Args, ctx: ToolContext) {
  const id = str(args.id)
  if (!id) return { error: 'id არ არის მითითებული' }

  const task = (await api.tasks.list(ctx.proj)).find((t) => t.id === id)
  // Not-found rather than forbidden: confirming a hidden task exists is itself
  // the leak the visibility rules are there to prevent.
  if (!task || !canSeeTask(ctx.actor, task)) {
    return { found: false, id, message: `დავალება ${id} ვერ მოიძებნა` }
  }

  const [children, counts] = await Promise.all([
    api.tasks.children(ctx.proj, id),
    childCounts(ctx.proj),
  ])
  const action = taskAction(ctx.actor, task, counts.get(id) ?? 0)

  return {
    found: true,
    ...taskRow(task),
    desc: task.desc,
    checklistItems: task.checklist.map((i) => ({
      text: i.text,
      done: i.done,
      ...(i.done ? { by: i.by, at: i.at } : {}),
    })),
    gate: {
      ...(task.gate.ready ? { ready: task.gate.ready } : { ready: null }),
      ...(task.gate.techOk ? { techOk: task.gate.techOk } : { techOk: null }),
    },
    children: children.filter((c) => canSeeTask(ctx.actor, c)).map(taskRow),
    history: (task.history ?? []).map((h) => ({ column: TASK_COL_LABEL[h.col], at: h.at, who: h.who })),
    // What *this* user can do with it right now, in the app's own words.
    yourNextStep: action
      ? { action: action.label, ...('disabled' in action && action.disabled ? { blocked: action.disabled } : {}) }
      : null,
  }
}

async function getMyWork(_args: Args, ctx: ToolContext) {
  const { actor } = ctx
  const [tasks, counts, defects] = await Promise.all([
    myTasks(ctx),
    childCounts(ctx.proj),
    api.defects.list(ctx.proj),
  ])

  // `taskAction` is the app's own answer to "whose move is it" — the same call
  // the task dialog's footer button is built from. Reusing it means the
  // assistant and the board can never disagree about what is waiting on whom.
  const judged = tasks
    .map((t) => ({ t, action: taskAction(actor, t, counts.get(t.id) ?? 0) }))
    .filter((x): x is { t: Task; action: NonNullable<ReturnType<typeof taskAction>> } => x.action !== null)

  const yours: (ReturnType<typeof taskRow> & { doNext: string })[] = []
  const waiting: (ReturnType<typeof taskRow> & { blocked: string })[] = []

  for (const { t, action } of judged) {
    const disabled = 'disabled' in action ? action.disabled : undefined
    if (disabled) {
      waiting.push({ ...taskRow(t), blocked: disabled })
    } else if (action.kind === 'unready') {
      // The only move left is to *withdraw* a sign-off already given — which
      // means this person is done and the confirmer is not. That is something
      // they are waiting on, not something to do today.
      waiting.push({ ...taskRow(t), blocked: 'თქვენი მხრიდან დასრულებულია — ელოდება დამდასტურებელს' })
    } else {
      yours.push({ ...taskRow(t), doNext: action.label })
    }
  }

  // Management files requests and then has no button on them — `taskAction`
  // rightly returns null. Without this they would get an empty briefing, when
  // what they actually want to know is where the work they asked for got to.
  const authored = canCreateRequest(actor)
    ? tasks.filter((t) => t.by === actor.name && t.col !== 'done')
    : []

  // Only the supervising roles carry a person, so only they have defects of
  // their own. For everyone else "mine" is the role's work, which is the tasks.
  const own = actor.personId ? defects.filter((d) => d.who === actor.name && isOpen(d)) : []

  return {
    who: actor.name,
    role: actor.role,
    today: TODAY,
    /** Tasks this user is the next step on. */
    yourMove: cap(yours, 10),
    /** Visible to them, but waiting on somebody else — with the reason. */
    waitingOnOthers: cap(waiting, 10),
    /** Work this user asked for, and where it got to. Empty for supervisors. */
    yourRequests: cap(
      authored.map((t) => ({ ...taskRow(t), stillIn: TASK_COL_LABEL[t.col] })),
      10,
    ),
    ...(actor.personId
      ? {
          yourDefects: {
            open: own.length,
            overdue: cap(own.filter(isOverdue).map(defectRow), 10),
            dueSoon: cap(own.filter((d) => !isOverdue(d)).map(defectRow), 10),
            link: `/qa${q({ who: actor.name })}`,
          },
        }
      : { yourDefects: null, note: 'ამ როლს კონკრეტული ხარვეზები არ ებმის — „ჩემი" ნიშნავს როლის საქმეს.' }),
    tasksLink: '/tasks',
  }
}

async function searchStandardsTool(args: Args) {
  const query = str(args.query)
  if (!query) return { error: 'query არ არის მითითებული' }

  const hits = searchStandards(query)
  const rows = STANDARD_INDEX.filter((s) => hits?.has(s.code))

  return {
    query,
    ...cap(
      rows.map((s) => ({
        code: s.code,
        title: s.title,
        cat: s.cat,
        kind: s.kind === 'S' ? 'სტანდარტი' : 'პროცესი',
        rev: s.rev,
        link: standardLink(s.code),
      })),
      limitOf(args.limit, 10),
    ),
    link: `/standards${q({ q: query })}`,
  }
}

/**
 * The catalogue, keyed on the same union the server builds its schemas from.
 * A tool named there and missing here is a compile error.
 */
export const TOOL_EXECUTORS: Record<ToolName, ToolExecutor> = {
  get_my_work: getMyWork,
  get_project_overview: getProjectOverview,
  get_floor_status: getFloorStatus,
  get_apartment: getApartment,
  search_defects: searchDefects,
  get_defect: getDefect,
  list_tasks: listTasks,
  get_task: getTask,
  search_standards: searchStandardsTool,
}

/** Short Georgian label for the "working on it" line while a tool runs. */
export function toolLabel(name: string, args: Args): string {
  switch (name) {
    case 'get_my_work':
      return 'ვამოწმებ თქვენს საქმეებს…'
    case 'get_project_overview':
      return 'ვკრებ პროექტის ჭრილს…'
    case 'get_floor_status':
      return `ვამოწმებ ${num(args.floor) ?? ''} სართულს…`
    case 'get_apartment':
      return `ვეძებ ბინა ${str(args.no) ?? ''}-ს…`
    case 'search_defects':
      return 'ვეძებ ხარვეზებს…'
    case 'get_defect':
      return `ვხსნი ხარვეზს ${str(args.id) ?? ''}…`
    case 'list_tasks':
      return 'ვკითხულობ დავალებებს…'
    case 'get_task':
      return `ვხსნი დავალებას ${str(args.id) ?? ''}…`
    case 'search_standards':
      return `ვეძებ სტანდარტებში „${str(args.query) ?? ''}"…`
    default:
      return 'ვამუშავებ…'
  }
}
