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

/** Status → [background, foreground] chip colors. */
export const STATUS_COLORS: Record<string, [string, string]> = {
  'ღია': ['#FFE7DB', '#C2410C'],
  'მიმდინარე': ['#E5EBFC', '#2447C6'],
  'შემოწმებაზე': ['#F6EDD6', '#92670A'],
  'დახურული': ['#DFF0E7', '#0E7D52'],
  'In Progress': ['#E5EBFC', '#2447C6'],
  'Completed': ['#DFF0E7', '#0E7D52'],
  'Delayed': ['#F6EDD6', '#92670A'],
  'Not Started': ['#EEF0EC', '#5A646B'],
  'დამტკიცებული': ['#DFF0E7', '#0E7D52'],
  'განხილვაში': ['#E5EBFC', '#2447C6'],
  'გადამუშავებაზე': ['#F6EDD6', '#92670A'],
  'ხელმოწერილი': ['#DFF0E7', '#0E7D52'],
  'ძალაშია': ['#DFF0E7', '#0E7D52'],
  'გამოწერილი': ['#F6EDD6', '#92670A'],
  'გაგზავნილი': ['#EEF0EC', '#5A646B'],
  'გადახდილი': ['#DFF0E7', '#0E7D52'],
}

export function statusColor(st: string): { bg: string; c: string } {
  const t = STATUS_COLORS[st] ?? ['#EEF0EC', '#5A646B']
  return { bg: t[0], c: t[1] }
}

export const TODAY = '2026-08-05'
