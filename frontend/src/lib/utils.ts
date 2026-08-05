import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Deterministic 0..1 hash used to generate stable demo data (ported from the prototype). */
export function hash01(s: string): number {
  let x = 2166136261
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i)
    x = Math.imul(x, 16777619)
  }
  return ((x >>> 0) % 1000) / 1000
}

const GE_MONTHS = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ']

const pad2 = (n: number) => String(n).padStart(2, '0')

/** ISO timestamp → `04 აგვ 16:40`. Returns the input unchanged if unparseable. */
export function formatStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad2(d.getDate())} ${GE_MONTHS[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
}
