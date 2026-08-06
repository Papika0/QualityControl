// Full-text search over the standards, so the filter finds a document by any
// material, tolerance or brand it specifies — not just by its title.

import { STANDARD_DOCS } from './standards-content'
import type { StandardBlock } from './domain'

/** Categories, in the order the filter chips show them. */
export const STANDARD_CATS = [
  'კონსტრუქცია',
  'წყობა',
  'მოპირკეთება',
  'ფასადი',
  'მონტაჟი',
  'MEP / სანტექნიკა',
  'ჰიდროიზოლაცია',
  'კეთილმოწყობა',
  'პროცესები',
]

function blockText(block: StandardBlock): string {
  switch (block.type) {
    case 'list':
      return block.items.join(' ')
    case 'table':
      return block.rows.flat().join(' ')
    case 'figure':
      return ''
    default:
      return block.text
  }
}

// Built once on first search rather than at module load — the standards page is
// one screen among many, and most sessions never open it.
let index: Map<string, string> | null = null

function haystack(): Map<string, string> {
  if (!index) {
    index = new Map(
      STANDARD_DOCS.map((doc) => [
        doc.code,
        [
          doc.code,
          doc.title,
          doc.cat,
          ...Object.values(doc.meta),
          ...doc.sections.flatMap((s) => [s.title ?? '', ...s.blocks.map(blockText)]),
        ]
          .join(' ')
          .toLowerCase(),
      ]),
    )
  }
  return index
}

/**
 * Codes of the standards matching `query`, or `null` when there is nothing to
 * search for — a null result means "no filter", which is not the same as a
 * search that matched nothing.
 */
export function searchStandards(query: string): Set<string> | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const hits = new Set<string>()
  for (const [code, text] of haystack()) {
    if (text.includes(q)) hits.add(code)
  }
  return hits
}
