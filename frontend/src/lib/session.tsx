import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  PROJECTS,
  QA_TEAM,
  ROLES,
  type Project,
  type ProjectId,
  type QaMember,
  type Role,
  type RoleId,
} from '@/data/domain'
import type { TaskActor } from './task-perms'

interface SessionState {
  role: Role | null
  /**
   * Which supervisor is signed in. Only the two supervising roles carry one —
   * everybody else acts as their role. Tasks are assigned to a person, so
   * without this a supervisor could not be shown their own work.
   */
  person: QaMember | null
  project: Project
  login: (role: RoleId, person?: string | null) => void
  logout: () => void
  setProject: (id: ProjectId) => void
  setRole: (id: RoleId) => void
  setPerson: (id: string | null) => void
}

const SessionContext = createContext<SessionState | null>(null)

const STORAGE_KEY = 'qc-session'

/** Roles that act as a named person rather than as the role itself. */
const PERSONAL_ROLES: RoleId[] = ['qa', 'techsup']

export function needsPerson(role: RoleId | null | undefined): boolean {
  return !!role && PERSONAL_ROLES.includes(role)
}

interface Stored {
  role: RoleId | null
  project: ProjectId
  person: string | null
}

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      // `person` post-dates the first release, so a session stored before it
      // existed still parses — it just comes back without one.
      const s = JSON.parse(raw) as Partial<Stored>
      return { role: s.role ?? null, project: s.project ?? 'NTB', person: s.person ?? null }
    }
  } catch {
    /* ignore corrupted storage */
  }
  return { role: null, project: 'NTB', person: null }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readStored)

  const persist = useCallback((next: Stored) => {
    setState(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  const value = useMemo<SessionState>(() => {
    const role = ROLES.find((r) => r.id === state.role) ?? null
    const project = PROJECTS.find((p) => p.id === state.project) ?? PROJECTS[0]!
    // A supervising role always resolves to somebody. A session stored before
    // `person` existed has none, and without this fallback that user would come
    // back to a board filtered to a person who is not there — empty, with
    // nothing on screen explaining why.
    const stored = QA_TEAM.find((m) => m.id === state.person) ?? null
    const person = needsPerson(state.role) ? (stored ?? QA_TEAM[0]!) : null
    return {
      role,
      person,
      project,
      login: (id, who) =>
        persist({ ...state, role: id, person: needsPerson(id) ? (who ?? QA_TEAM[0]!.id) : null }),
      logout: () => persist({ ...state, role: null, person: null }),
      setProject: (id) => persist({ ...state, project: id }),
      // Switching into a supervising role has to land on somebody, or the board
      // would come up empty with no way to tell why.
      setRole: (id) =>
        persist({
          ...state,
          role: id,
          person: needsPerson(id) ? (state.person ?? QA_TEAM[0]!.id) : null,
        }),
      setPerson: (id) => persist({ ...state, person: id }),
    }
  }, [state, persist])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}

/** The session, in the shape the task permission rules want. */
export function useTaskActor(): TaskActor {
  const { role, person } = useSession()
  return useMemo(
    () => ({
      role: role?.id,
      personId: person?.id ?? null,
      name: person?.name ?? role?.name ?? 'უცნობი მომხმარებელი',
    }),
    [role, person],
  )
}
