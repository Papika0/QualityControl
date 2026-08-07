// Address handling for the manual recipient list.
//
// The check is deliberately shallow — one @, something either side, a dot in
// the domain. A stricter grammar rejects addresses that deliver fine, and the
// real verdict comes from Resend either way. `server/notify.ts` keeps its own
// copy of this rule: the server builds under a separate tsconfig and cannot
// import from `src/`, and it must never trust the browser's check anyway.

const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Trimmed and lowercased — the form the list stores and compares on. */
export function normalizeMail(value: string): string {
  return value.trim().toLowerCase()
}

export function isEmail(value: string): boolean {
  return SHAPE.test(normalizeMail(value))
}
