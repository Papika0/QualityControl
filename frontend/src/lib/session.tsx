import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { PROJECTS, ROLES, type Project, type ProjectId, type Role, type RoleId } from '@/data/domain'

interface SessionState {
  role: Role | null
  project: Project
  login: (role: RoleId) => void
  logout: () => void
  setProject: (id: ProjectId) => void
  setRole: (id: RoleId) => void
}

const SessionContext = createContext<SessionState | null>(null)

const STORAGE_KEY = 'qc-session'

function readStored(): { role: RoleId | null; project: ProjectId } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore corrupted storage */
  }
  return { role: null, project: 'NTB' }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readStored)

  const persist = useCallback((next: { role: RoleId | null; project: ProjectId }) => {
    setState(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  const value = useMemo<SessionState>(() => {
    const role = ROLES.find((r) => r.id === state.role) ?? null
    const project = PROJECTS.find((p) => p.id === state.project) ?? PROJECTS[0]!
    return {
      role,
      project,
      login: (id) => persist({ ...state, role: id }),
      logout: () => persist({ ...state, role: null }),
      setProject: (id) => persist({ ...state, project: id }),
      setRole: (id) => persist({ ...state, role: id }),
    }
  }, [state, persist])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}
