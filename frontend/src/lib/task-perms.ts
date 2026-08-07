// Who may see and do what with a task.
//
// This lives outside `data/domain.ts` on purpose: domain.ts is reference data
// and pure state machines with no notion of who is logged in, while every rule
// here needs an actor — a role *and*, for the supervisors, a person id. The
// dependency runs one way (this file imports domain types, nothing imports
// back), so there is no cycle.
//
// Nothing here is security: the app has no auth and the topbar lets anyone
// switch role. These predicates shape the UI. The data gates that actually
// make a `დასრულებული` task mean something are enforced in `api/client.ts`.

import {
  TASK_COL_LABEL,
  nextTaskColumn,
  type RoleId,
  type Task,
  type TaskColumn,
  type TaskTrack,
} from '@/data/domain'

/** The logged-in person, as the task rules need them. */
export interface TaskActor {
  role: RoleId | undefined
  /** `QA_TEAM` id when the role is qa/techsup, otherwise null. */
  personId: string | null
  /** Display name — what gets stamped into gates, comments and history. */
  name: string
}

/**
 * Columns whose exit needs a ready → confirm handshake. Starting a task
 * (`new` → `prog`) is deliberately not one: the supervisor picking up the work
 * is not a decision the manager signs off on.
 */
const HANDSHAKE_COLS: TaskColumn[] = ['prog', 'check']

const SUPERVISORS: RoleId[] = ['qa', 'techsup']
/** Roles that may vouch a main-track task is genuinely ready to close. */
const TECH: RoleId[] = ['techdir', 'techsup']

export function isSupervisor(a: TaskActor): boolean {
  return !!a.role && SUPERVISORS.includes(a.role)
}

/** True when this task is assigned to the actor themselves. */
export function isOwn(a: TaskActor, t: Task): boolean {
  return !!a.personId && t.whoId === a.personId
}

// ── creating ────────────────────────────────────────────────────────────────

/** Roles that file a request for somebody else to break down. */
export function canCreateRequest(a: TaskActor): boolean {
  return a.role === 'pmdir' || a.role === 'pfm' || a.role === 'pm' || a.role === 'admin'
}

/** Roles that file a ready-to-work task straight into `ახალი`. */
export function canCreateDirect(a: TaskActor): boolean {
  return a.role === 'pm' || a.role === 'techdir' || a.role === 'admin'
}

export function canCreateTask(a: TaskActor): boolean {
  return canCreateRequest(a) || canCreateDirect(a)
}

/** Columns this actor may file into, in board order. */
export function allowedNewColumns(a: TaskActor): TaskColumn[] {
  const cols: TaskColumn[] = []
  if (canCreateRequest(a)) cols.push('req')
  if (canCreateDirect(a)) cols.push('new')
  return cols
}

/** Tracks this actor may file onto. */
export function allowedTracks(a: TaskActor): TaskTrack[] {
  if (a.role === 'admin') return ['main', 'tech']
  if (a.role === 'techdir') return ['tech']
  return ['main']
}

// ── seeing ──────────────────────────────────────────────────────────────────

export function canSeeTask(a: TaskActor, t: Task): boolean {
  if (a.role === 'admin') return true

  if (t.track === 'tech') {
    // The tech chain is between two people and nobody else.
    if (a.role === 'techdir') return true
    if (a.role === 'techsup') return isOwn(a, t)
    return false
  }

  // A request has no work in it yet — only the management that files one and
  // the manager who breaks it down have any use for it.
  if (t.col === 'req') return a.role === 'pm' || a.role === 'pmdir' || a.role === 'pfm'

  if (a.role === 'qa') return isOwn(a, t)
  // The technical side watches the whole site flow, because it has to sign off
  // on every closure.
  if (a.role === 'techdir' || a.role === 'techsup') return true
  return a.role === 'pm' || a.role === 'pmdir' || a.role === 'pfm'
}

export function visibleTasks(a: TaskActor, tasks: Task[]): Task[] {
  return tasks.filter((t) => canSeeTask(a, t))
}

/** Whether the board should show a `უფროსის მოთხოვნა` column at all. */
export function canSeeRequests(a: TaskActor): boolean {
  return a.role === 'admin' || a.role === 'pm' || a.role === 'pmdir' || a.role === 'pfm'
}

// ── acting ──────────────────────────────────────────────────────────────────

/**
 * Supervisors never edit a ticket — they report against it. Everyone else with
 * sight of the task may correct it.
 */
export function canEditTask(a: TaskActor, t: Task): boolean {
  if (isSupervisor(a)) return false
  return canSeeTask(a, t)
}

/**
 * Whether this actor writes the breakdown for work on a given track. Split out
 * from `canBreakDown` because the create form has to ask before a task exists.
 */
export function ownsBreakdown(a: TaskActor, track: TaskTrack): boolean {
  if (a.role === 'admin') return true
  return track === 'tech' ? a.role === 'techdir' : a.role === 'pm'
}

/** Writing the checklist and splitting off sub-tasks is the manager's job. */
export function canBreakDown(a: TaskActor, t: Task): boolean {
  return t.col !== 'done' && ownsBreakdown(a, t.track) && canSeeTask(a, t)
}

export function canTickChecklist(a: TaskActor, t: Task): boolean {
  if (a.role === 'admin') return t.col !== 'done'
  if (!isSupervisor(a) || !isOwn(a, t)) return false
  return t.col === 'prog' || t.col === 'check'
}

export function canMarkReady(a: TaskActor, t: Task): boolean {
  if (!HANDSHAKE_COLS.includes(t.col)) return false
  if (a.role === 'admin') return true
  return isSupervisor(a) && isOwn(a, t)
}

/** Who signs off the handshake and moves the task on. */
export function canConfirm(a: TaskActor, t: Task): boolean {
  if (a.role === 'admin') return true
  return t.track === 'tech' ? a.role === 'techdir' : a.role === 'pm'
}

/** Who may vouch that a main-track task is genuinely ready to close. */
export function canTechConfirm(a: TaskActor, t: Task): boolean {
  if (t.track !== 'main' || t.col === 'req' || t.col === 'done') return false
  return a.role === 'admin' || (!!a.role && TECH.includes(a.role))
}

/** True once the request carries enough for a supervisor to act on it. */
export function isBrokenDown(t: Task, childCount: number): boolean {
  return t.checklist.length > 0 || childCount > 0
}

// ── the one thing to do next ────────────────────────────────────────────────

/**
 * The single action this actor can take on this task right now. The dialog
 * reads one value instead of branching on eight booleans, and the same result
 * carries both the button label and the reason it is disabled.
 */
export interface TaskAction {
  kind: 'publish' | 'start' | 'ready' | 'unready' | 'confirm' | 'techok'
  label: string
  /** Set when the action is the right one but cannot run yet — and why. */
  disabled?: string
}

export function taskAction(a: TaskActor, t: Task, childCount = 0): TaskAction | null {
  const next = nextTaskColumn(t.col)
  if (!next) return null

  if (t.col === 'req') {
    if (!canConfirm(a, t)) return null
    const missing = !t.whoId
      ? 'დანიშნეთ შემსრულებელი'
      : !isBrokenDown(t, childCount)
        ? 'დაამატეთ ჩეკლისტი ან ქვე-დავალება'
        : undefined
    return { kind: 'publish', label: 'გამოქვეყნება → ახალი', disabled: missing }
  }

  if (t.col === 'new') {
    if (a.role === 'admin') return { kind: 'confirm', label: `დაწყება → ${TASK_COL_LABEL.prog}` }
    // Assignment decides this, not which supervising role is worn: the same
    // person can appear on both rosters, and gating `start` on the track while
    // ticking and signing off ignore it would strand them mid-task.
    if (isSupervisor(a) && isOwn(a, t)) {
      return { kind: 'start', label: `დაწყება → ${TASK_COL_LABEL.prog}` }
    }
    return null
  }

  // prog | check — the handshake columns. Order matters: signing off comes
  // before confirming, so an actor who can do both (admin) is offered the step
  // the task is actually waiting on.
  if (canMarkReady(a, t) && !t.gate.ready) {
    return { kind: 'ready', label: 'მზადაა შემდეგი სტატუსისთვის' }
  }

  if (canConfirm(a, t)) {
    const needsTech = next === 'done' && t.track === 'main' && !t.gate.techOk
    const disabled = !t.gate.ready
      ? 'ელოდება ზედამხედველის მზადყოფნას'
      : needsTech
        ? 'საჭიროა ტექნიკური დადასტურება'
        : undefined
    return { kind: 'confirm', label: `დადასტურება → ${TASK_COL_LABEL[next]}`, disabled }
  }

  if (canMarkReady(a, t)) return { kind: 'unready', label: 'მზადყოფნის გაუქმება' }

  if (canTechConfirm(a, t) && !t.gate.techOk) {
    return { kind: 'techok', label: 'ტექნიკური დადასტურება' }
  }

  return null
}
