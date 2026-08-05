// The QA roster, and the only place mailbox addresses appear.
//
// Names and ids are mirrored in `src/data/domain.ts` (QA_TEAM) so the assignee
// dropdown can render without shipping anybody's address to the browser. The
// two lists are joined by `id`, and `memberById` returns undefined for an id it
// does not know — the notify handler turns that into a 400 rather than a silent
// no-send, so a drift between the two files fails loudly the first time someone
// files a defect.

export interface QaMember {
  id: string
  /** Display name, as it appears in the app and in the greeting line. */
  name: string
  mail: string
}

export const QA_TEAM: QaMember[] = [
  { id: 'guji', name: 'გუჯი გვენცაძე', mail: 'gujeksa35@gmail.com' },
  { id: 'paata', name: 'პაატა გვათუა', mail: 'gujeksa35@gmail.com' },
  { id: 'daniel', name: 'დანიელ პაპისმედოვი', mail: 'gujeksa35@gmail.com' },
]

export function memberById(id: string): QaMember | undefined {
  return QA_TEAM.find((m) => m.id === id)
}
