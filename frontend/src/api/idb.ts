// Minimal promise wrapper over IndexedDB. Deliberately not a dependency: the
// app needs object stores with a string keyPath, a few indexes, batched writes
// and a wipe — not a query DSL.
//
// When IndexedDB is unavailable (private browsing, locked-down webviews) the
// same interface is served from memory, so the app still boots and behaves
// normally; only persistence across reloads is lost. Callers can check
// `persistent` if they want to say so in the UI.

export interface IndexSpec {
  name: string
  /** Array keyPath = compound index, queried with an array key. */
  keyPath: string | string[]
}

export interface StoreSpec<Name extends string = string> {
  name: Name
  keyPath: string
  indexes?: IndexSpec[]
}

export type WriteOp<Name extends string = string> =
  | { store: Name; put: unknown }
  | { store: Name; del: IDBValidKey }

export interface Backend<Name extends string = string> {
  /** false on the in-memory fallback — data dies with the tab. */
  readonly persistent: boolean
  getAll<T>(store: Name, index?: string, query?: IDBValidKey): Promise<T[]>
  get<T>(store: Name, key: IDBValidKey): Promise<T | undefined>
  /** Applies every op inside one transaction — all of it lands, or none of it. */
  write(ops: WriteOp<Name>[]): Promise<void>
  clear(stores: Name[]): Promise<void>
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'))
  })
}

/**
 * Ceiling on a write. WebKit can leave a transaction that never fires
 * `complete`, `error` or `abort` — the caller's promise would then hang for the
 * life of the tab, which reads to the user as a button that saves forever.
 */
const TX_TIMEOUT_MS = 20_000

function settled(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('IndexedDB transaction timed out')),
      TX_TIMEOUT_MS,
    )
    const finish = (done: () => void) => {
      clearTimeout(timer)
      done()
    }
    tx.oncomplete = () => finish(resolve)
    tx.onerror = () => finish(() => reject(tx.error ?? new Error('IndexedDB transaction failed')))
    tx.onabort = () => finish(() => reject(tx.error ?? new Error('IndexedDB transaction aborted')))
  })
}

/** Reads a store/index key out of a record. Array keyPath → array key. */
function keyOf(value: unknown, keyPath: string | string[]): IDBValidKey {
  const rec = value as Record<string, IDBValidKey>
  return Array.isArray(keyPath) ? keyPath.map((k) => rec[k]!) : rec[keyPath]!
}

class IdbBackend implements Backend {
  readonly persistent = true

  constructor(private readonly db: IDBDatabase) {}

  getAll<T>(store: string, index?: string, query?: IDBValidKey): Promise<T[]> {
    const os = this.db.transaction(store, 'readonly').objectStore(store)
    return request<T[]>((index ? os.index(index) : os).getAll(query))
  }

  get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return request<T | undefined>(this.db.transaction(store, 'readonly').objectStore(store).get(key))
  }

  async write(ops: WriteOp[]): Promise<void> {
    if (ops.length === 0) return
    // Every op is known up front, so nothing yields mid-transaction and the
    // browser cannot auto-close it under us.
    const names = [...new Set(ops.map((o) => o.store))]
    const tx = this.db.transaction(names, 'readwrite')
    for (const op of ops) {
      const os = tx.objectStore(op.store)
      if ('put' in op) os.put(op.put)
      else os.delete(op.del)
    }
    await settled(tx)
  }

  async clear(stores: string[]): Promise<void> {
    if (stores.length === 0) return
    const tx = this.db.transaction(stores, 'readwrite')
    stores.forEach((n) => tx.objectStore(n).clear())
    await settled(tx)
  }
}

class MemoryBackend implements Backend {
  readonly persistent = false
  private readonly tables = new Map<string, Map<string, unknown>>()

  constructor(private readonly specs: StoreSpec[]) {
    specs.forEach((s) => this.tables.set(s.name, new Map()))
  }

  private spec(store: string): StoreSpec {
    const s = this.specs.find((x) => x.name === store)
    if (!s) throw new Error(`Unknown store "${store}"`)
    return s
  }

  private table(store: string): Map<string, unknown> {
    const t = this.tables.get(store)
    if (!t) throw new Error(`Unknown store "${store}"`)
    return t
  }

  async getAll<T>(store: string, index?: string, query?: IDBValidKey): Promise<T[]> {
    const rows = [...this.table(store).values()] as T[]
    if (!index || query === undefined) return rows
    const idx = this.spec(store).indexes?.find((i) => i.name === index)
    if (!idx) throw new Error(`Unknown index "${index}" on "${store}"`)
    const want = JSON.stringify(query)
    return rows.filter((r) => JSON.stringify(keyOf(r, idx.keyPath)) === want)
  }

  async get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return this.table(store).get(String(key)) as T | undefined
  }

  async write(ops: WriteOp[]): Promise<void> {
    for (const op of ops) {
      if ('put' in op) this.table(op.store).set(String(keyOf(op.put, this.spec(op.store).keyPath)), op.put)
      else this.table(op.store).delete(String(op.del))
    }
  }

  async clear(stores: string[]): Promise<void> {
    stores.forEach((n) => this.table(n).clear())
  }
}

function openIdb(name: string, version: number, stores: StoreSpec[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const spec of stores) {
        const os = db.objectStoreNames.contains(spec.name)
          ? req.transaction!.objectStore(spec.name)
          : db.createObjectStore(spec.name, { keyPath: spec.keyPath })
        for (const idx of spec.indexes ?? []) {
          if (!os.indexNames.contains(idx.name)) os.createIndex(idx.name, idx.keyPath)
        }
      }
      // Drop anything the schema no longer declares (iterate backwards — the
      // list mutates as stores are deleted).
      for (let i = db.objectStoreNames.length - 1; i >= 0; i--) {
        const existing = db.objectStoreNames[i]!
        if (!stores.some((s) => s.name === existing)) db.deleteObjectStore(existing)
      }
    }
    req.onsuccess = () => {
      // Another tab opening a newer version must not be left hanging.
      req.result.onversionchange = () => req.result.close()
      resolve(req.result)
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open tab'))
  })
}

export async function openBackend<Name extends string>(
  name: string,
  version: number,
  stores: StoreSpec<Name>[],
): Promise<Backend<Name>> {
  if (typeof indexedDB === 'undefined') return new MemoryBackend(stores)
  try {
    return new IdbBackend(await openIdb(name, version, stores))
  } catch (err) {
    console.warn('[qc] IndexedDB unavailable — falling back to in-memory storage.', err)
    return new MemoryBackend(stores)
  }
}
