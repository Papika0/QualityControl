// Store layout and the single lazily-opened database handle.
//
// `db()` memoises one open-and-seed promise, so the first component to query
// triggers the work and every later caller awaits the same result — no
// provider, no boot race, no double-seed under React StrictMode.

import { openBackend, type Backend, type StoreSpec } from './idb'
import { SEED_VERSION, seedRecords } from './seed'

const DB_NAME = 'qc-platform'
// v2 added the `photos` store, v3 the `defectComments` store, v4 the `stages`
// store, v5 the `recipients` store, v6 the `by-project` index on tasks and
// `by-task` on photos. Bumping the version runs `onupgradeneeded`, which
// creates missing stores and indexes without touching the rows already there.
//
// v6 exists because two branches both shipped a "v5": the recipients store and
// the task indexes. A browser that opened either one is already at 5 and would
// never run the upgrade for the other half — the merged schema needs a number
// neither side has used.
const DB_VERSION = 6

export type StoreName =
  | 'apartments' | 'defects' | 'photos' | 'stages' | 'tasks' | 'taskComments'
  | 'defectComments' | 'standards'
  | 'drawings' | 'archive' | 'users' | 'recipients'
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
  // Manually added mail recipients. Never seeded, and keyed by a generated id
  // rather than the address itself so editing one stays a single put.
  { name: 'recipients', keyPath: 'id' },
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
  // A version bump regenerates the demo dataset, but it is not the user asking
  // for a reset — anything they entered by hand that a generator does not own
  // survives it.
  if (meta?.version !== SEED_VERSION) {
    await seed(backend, ALL_STORES.filter((s) => !KEEP_ON_RESEED.includes(s)))
  }
  return backend
}

/**
 * Configuration rather than demo content: the mail recipients somebody typed
 * into Admin point at nothing the generators produce, so a version bump has no
 * reason to take them out. Comments and photos are not on this list — they hang
 * off defect and task ids that a reseed regenerates, and keeping them would
 * leave rows pointing at records that no longer exist.
 */
const KEEP_ON_RESEED: StoreName[] = ['recipients']

async function seed(backend: Backend<StoreName>, stores = ALL_STORES): Promise<void> {
  await backend.clear(stores)
  await backend.write(seedRecords())
  const meta: SeedMeta = { key: 'seed', version: SEED_VERSION, at: new Date().toISOString() }
  await backend.write([{ store: 'meta', put: meta }])
}

/** Wipes every store — including the hand-entered ones — and regenerates. */
export async function resetDatabase(): Promise<void> {
  await seed(await db())
}
