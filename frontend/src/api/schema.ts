// Store layout and the single lazily-opened database handle.
//
// `db()` memoises one open-and-seed promise, so the first component to query
// triggers the work and every later caller awaits the same result — no
// provider, no boot race, no double-seed under React StrictMode.

import { openBackend, type Backend, type StoreSpec } from './idb'
import { SEED_VERSION, seedRecords } from './seed'

const DB_NAME = 'qc-platform'
// v2 added the `photos` store, v3 the `defectComments` store, v4 the `stages`
// store, v5 the `by-project` index on tasks and `by-task` on photos. Bumping
// the version runs `onupgradeneeded`, which creates missing stores and indexes
// without touching the rows already there.
const DB_VERSION = 5

export type StoreName =
  | 'apartments' | 'defects' | 'photos' | 'stages' | 'tasks' | 'taskComments'
  | 'defectComments' | 'standards'
  | 'drawings' | 'archive' | 'users'
  | 'meta'

const SPECS: StoreSpec<StoreName>[] = [
  {
    name: 'apartments',
    keyPath: 'key',
    indexes: [{ name: 'by-project', keyPath: 'proj' }],
  },
  {
    name: 'defects',
    keyPath: 'key',
    indexes: [
      { name: 'by-project', keyPath: 'proj' },
      { name: 'by-apartment', keyPath: ['proj', 'apt'] },
    ],
  },
  // Field photos, keyed to whatever they document. Blobs live in their own
  // store so listing defects never drags megabytes of image data along. A row
  // carries `defect` or `taskId`, never both, and IndexedDB leaves it out of
  // the index whose keyPath it lacks — so the two sets stay disjoint for free.
  {
    name: 'photos',
    keyPath: 'id',
    indexes: [
      { name: 'by-defect', keyPath: 'defect' },
      { name: 'by-task', keyPath: 'taskId' },
    ],
  },
  {
    name: 'stages',
    keyPath: 'key',
    indexes: [
      { name: 'by-project', keyPath: 'proj' },
      { name: 'by-apartment', keyPath: ['proj', 'apt'] },
    ],
  },
  // Task ids are minted unique across the whole store, not per project, so the
  // key stays `id` — `onupgradeneeded` can add an index but cannot change a
  // keyPath, and a composite key would mean dropping and recreating the store.
  { name: 'tasks', keyPath: 'id', indexes: [{ name: 'by-project', keyPath: 'proj' }] },
  { name: 'taskComments', keyPath: 'id', indexes: [{ name: 'by-task', keyPath: 'taskId' }] },
  // Comments are never seeded — every row here was typed by a person.
  { name: 'defectComments', keyPath: 'id', indexes: [{ name: 'by-defect', keyPath: 'defect' }] },
  { name: 'standards', keyPath: 'code' },
  { name: 'drawings', keyPath: 'code' },
  { name: 'archive', keyPath: 'id' },
  { name: 'users', keyPath: 'mail' },
  { name: 'meta', keyPath: 'key' },
]

const ALL_STORES = SPECS.map((s) => s.name)

interface SeedMeta {
  key: 'seed'
  version: number
  at: string
}

let handle: Promise<Backend<StoreName>> | null = null

export function db(): Promise<Backend<StoreName>> {
  if (!handle) {
    handle = open().catch((err) => {
      handle = null // let the next caller retry instead of caching the failure
      throw err
    })
  }
  return handle
}

async function open(): Promise<Backend<StoreName>> {
  const backend = await openBackend(DB_NAME, DB_VERSION, SPECS)
  const meta = await backend.get<SeedMeta>('meta', 'seed')
  if (meta?.version !== SEED_VERSION) await seed(backend)
  return backend
}

async function seed(backend: Backend<StoreName>): Promise<void> {
  await backend.clear(ALL_STORES)
  await backend.write(seedRecords())
  const meta: SeedMeta = { key: 'seed', version: SEED_VERSION, at: new Date().toISOString() }
  await backend.write([{ store: 'meta', put: meta }])
}

/** Wipes every store and regenerates the demo dataset. */
export async function resetDatabase(): Promise<void> {
  await seed(await db())
}
