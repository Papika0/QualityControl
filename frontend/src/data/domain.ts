// Domain model + reference data for the QC platform.
// Ported from the approved interactive prototype (Nutsubidze 2A Platform).

export type RoleId = 'admin' | 'techdir' | 'pm' | 'qa' | 'sub' | 'owner'

export interface Role {
  id: RoleId
  name: string
  ini: string
  canFinance: boolean
  canAdmin: boolean
  scope: string
}

export type ProjectId = 'NTB' | 'SBP' | 'BTM'

export interface Project {
  id: ProjectId
  name: string
  addr: string
}

export type DefectStatus = 'ღია' | 'მიმდინარე' | 'შემოწმებაზე' | 'დახურული'
export type Priority = 'high' | 'med' | 'low'
export type TaskColumn = 'new' | 'prog' | 'check' | 'done'

export interface Apartment {
  no: string
  floor: number
  prog: number
  defects: number
  sold: boolean
  late: boolean
  area: number
  rooms: number
}

/** One step of a defect's life: the moment it entered a status, and by whom. */
export interface DefectEvent {
  st: DefectStatus
  /** ISO timestamp — formatted for display with `formatStamp`. */
  at: string
  who: string
}

export interface Defect {
  id: string
  cat: string
  apt: string
  room: string
  pri: Priority
  st: DefectStatus
  who: string
  sub: string
  due: string
  desc: string
  /**
   * Status transitions in the order they happened, starting with the filing.
   * The dialog's process timeline reads its stamps from here, so each defect
   * shows its own dates. Optional only for rows written before it existed.
   */
  history?: DefectEvent[]
}

export interface Task {
  id: string
  title: string
  loc: string
  who: string
  due: string
  col: TaskColumn
  pri: Priority
  floor: number
  type: string
}

export interface Standard {
  code: string
  title: string
  cat: string
  files: string[]
  rev: string
  updated: string
}

export interface DocRow {
  code: string
  name: string
  meta: string
  rev: string
  st: string
}

export interface ArchiveRow {
  id: string
  ext: string
  name: string
  meta: string
  amt: string
  st: string
}

export interface ContractRow {
  id: string
  sub: string
  scope: string
  pct: number
  amt: string
  paid: string
  st: string
}

export interface AuditRow {
  id: string
  /** 'YYYY-MM-DD HH:mm' — sorts lexicographically. */
  t: string
  action: string
  detail: string
  who: string
}

export interface UserRow {
  ini: string
  name: string
  mail: string
  role: string
  scope: string
  active: boolean
}

export interface TaskComment {
  id: string
  taskId: string
  who: string
  /** ISO local timestamp — formatted for display with `formatStamp`. */
  at: string
  text: string
}

export interface DefectComment {
  id: string
  /** `proj:defectId` — the defect this comment was written on. */
  defect: string
  who: string
  /** ISO local timestamp — formatted for display with `formatStamp`. */
  at: string
  text: string
}

export const ROLES: Role[] = [
  { id: 'admin', name: 'სისტემის ადმინისტრატორი', ini: 'სა', canFinance: true, canAdmin: true, scope: 'ყველა პროექტი, ყველა მოდული' },
  { id: 'techdir', name: 'ტექნიკური დირექტორი', ini: 'თდ', canFinance: true, canAdmin: false, scope: 'ყველა პროექტი' },
  { id: 'pm', name: 'პროექტის მენეჯერი', ini: 'ნბ', canFinance: false, canAdmin: false, scope: 'საკუთარი პროექტები' },
  { id: 'qa', name: 'ზედამხედველი (QA/QC)', ini: 'გკ', canFinance: false, canAdmin: false, scope: 'მინიჭებული პროექტები' },
  { id: 'sub', name: 'ქვეკონტრაქტორი', ini: 'ლჩ', canFinance: false, canAdmin: false, scope: 'მხოლოდ საკუთარი სამუშაოები' },
  { id: 'owner', name: 'ბინის მფლობელი (Portal)', ini: 'დგ', canFinance: false, canAdmin: false, scope: 'მხოლოდ ბინა 1204' },
]

export const PROJECTS: Project[] = [
  { id: 'NTB', name: 'ნუცუბიძე 2ა', addr: 'ალექსანდრე ბანძელაძის ქუჩა' },
  { id: 'SBP', name: 'საბურთალო პარკი', addr: 'ვაჟა-ფშაველას 41, თბილისი' },
  { id: 'BTM', name: 'ბათუმი სითი თაუერი', addr: 'ხიმშიაშვილის 15, ბათუმი' },
]

export const STAGES = [
  'Structural', 'Block', 'Plaster', 'MEP Rough', 'Electrical', 'Plumbing',
  'Waterproofing', 'Tile', 'Painting', 'Ceiling', 'Floor', 'Doors',
  'Kitchen', 'Sanitary', 'Cleaning', 'Handover',
] as const

export const CATS = [
  'Concrete', 'Block', 'Plaster', 'Painting', 'Tiles', 'Waterproofing',
  'Electrical', 'Plumbing', 'HVAC', 'Facade', 'Windows', 'Doors',
  'Fire Fighting', 'Finishing', 'Other',
] as const

/** Auto-recommendation per defect category — inserted when an inspector picks a category. */
export const RECO: Record<string, string> = {
  Tiles: 'გამოყენებული წებოს ტიპი არ შეესაბამება სპეციფიკაციას. საჭიროა ფილის დემონტაჟი და ხელახალი მოწყობა C2TE კლასის წებოთი, ღრეჩოს სიგანის დაცვით.',
  Electrical: 'კაბელის კვეთა არ შეესაბამება პროექტს. საჭიროა შეცვლა პროექტით გათვალისწინებული კვეთით და იზოლაციის გაზომვა.',
  Plaster: 'ბათქაშის გადახრა აღემატება ნორმას (3 მმ / 2 მ). საჭიროა ზედაპირის გასწორება და ხელახალი მიღება.',
  Waterproofing: 'ჰიდროიზოლაცია არ არის დაყვანილი კედელზე მინ. 150 მმ სიმაღლეზე. საჭიროა აღდგენა და 24-სთ წყლის ტესტი.',
  Concrete: 'ბეტონის ზედაპირზე ფიქსირდება კავერნები. საჭიროა გაწმენდა და აღდგენა სარემონტო ნარევით.',
  Plumbing: 'მილის დახრილობა არ შეესაბამება ნორმას. საჭიროა გადაგება და ჰერმეტულობის შემოწმება.',
  HVAC: 'ჰაერსატარის შეერთება არ არის ჰერმეტიზებული. საჭიროა დამუშავება და ბალანსირება.',
  Windows: 'შემინვის კონტური არ არის ჰერმეტიზებული. საჭიროა ჩარჩოს რეგულირება და კონტურის აღდგენა.',
  Painting: 'საღებავის ფენა არათანაბარია. საჭიროა ზედაპირის დამუშავება და შეღებვა ორ ფენად.',
  Block: 'წყობის გადახრა ვერტიკალიდან აღემატება დასაშვებს. საჭიროა უბნის გადაწყობა.',
  Doors: 'კარის ჩარჩო არ არის დონეზე. საჭიროა რეგულირება.',
  Facade: 'პანელებს შორის ღრეჩო არ შეესაბამება დეტალს. საჭიროა კორექტირება.',
  'Fire Fighting': 'სპრინკლერის განლაგება არ შეესაბამება პროექტს. საჭიროა გადატანა და ჰიდრავლიკური ტესტი.',
  Finishing: 'მოპირკეთების კუთხის შეერთება შესრულებულია უხარისხოდ. საჭიროა გადაკეთება.',
  Other: 'აღწერეთ ხარვეზი და გამოსასწორებელი ღონისძიება.',
}

export const PEOPLE = ['ნ. ბერიძე', 'გ. კვარაცხელია', 'ლ. ჩხეიძე', 'ი. მაისურაძე', 'თ. აბულაძე', 'ზ. ხურციძე', 'მ. ლომიძე']

export const SUBS = ['შპს ალიანს-მშენი', 'შპს ტექნო-ინსტალაცია', 'ი/მ ჯ. წიკლაური', 'შპს ფასად-პრო']

export const ROOMS = ['სამზარეულო', 'სველი წერტილი', 'მისაღები', 'საძინებელი', 'ჰოლი']

export const TASK_TYPES = [
  'ინსპექცია — ზოგადი',
  'მილების გადმოსვლის შემოწმება (10 სმ)',
  'კერამოგრანიტის შემოწმება',
  'ელექტროობის შემოწმება',
  'წყობის შემოწმება',
  'ფასადის შემოწმება',
  'ლიფტის მონტაჟის შემოწმება',
  'MEP ტესტირება',
]

export const PRI_LABEL: Record<Priority, string> = { high: 'მაღალი', med: 'საშუალო', low: 'დაბალი' }

/** Defect lifecycle, in order. Advancing a defect walks one step down this list. */
export const DEFECT_FLOW: DefectStatus[] = ['ღია', 'მიმდინარე', 'შემოწმებაზე', 'დახურული']

export function nextDefectStatus(st: DefectStatus): DefectStatus | null {
  const i = DEFECT_FLOW.indexOf(st)
  return i >= 0 && i < DEFECT_FLOW.length - 1 ? DEFECT_FLOW[i + 1]! : null
}

/** Kanban lifecycle, in order. */
export const TASK_FLOW: TaskColumn[] = ['new', 'prog', 'check', 'done']

export function nextTaskColumn(col: TaskColumn): TaskColumn | null {
  const i = TASK_FLOW.indexOf(col)
  return i >= 0 && i < TASK_FLOW.length - 1 ? TASK_FLOW[i + 1]! : null
}

/**
 * Semantic tone. Colors live in index.css as `--color-tone-*` so both themes
 * resolve from one place — never hardcode a status hex in a component.
 */
export type Tone = 'open' | 'info' | 'warn' | 'ok' | 'neutral'

/** Status label → tone. Covers defect, task, document and invoice statuses. */
export const STATUS_TONE: Record<string, Tone> = {
  'ღია': 'open',
  'მიმდინარე': 'info',
  'შემოწმებაზე': 'warn',
  'დახურული': 'ok',
  'In Progress': 'info',
  'Completed': 'ok',
  'Delayed': 'warn',
  'Not Started': 'neutral',
  'დამტკიცებული': 'ok',
  'განხილვაში': 'info',
  'გადამუშავებაზე': 'warn',
  'ხელმოწერილი': 'ok',
  'ძალაშია': 'ok',
  'გამოწერილი': 'warn',
  'გაგზავნილი': 'neutral',
  'გადახდილი': 'ok',
}

/** Chip surface + label for a status, as CSS vars so they follow the theme. */
export function statusColor(st: string): { bg: string; c: string } {
  const tone = STATUS_TONE[st] ?? 'neutral'
  return { bg: `var(--color-tone-${tone}-bg)`, c: `var(--color-tone-${tone}-fg)` }
}

/** Solid tone color for dots, bars and chart strokes. */
export function toneSolid(tone: Tone): string {
  return `var(--color-tone-${tone}-solid)`
}

/** Priority dot colors — red / amber / muted, as in the prototype's PRI map. */
export const PRI_DOT: Record<Priority, string> = {
  high: 'var(--color-tone-danger-solid)',
  med: 'var(--color-tone-warn-solid)',
  low: 'var(--color-tone-neutral-solid)',
}

export const TODAY = '2026-08-05'
