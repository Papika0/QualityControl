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
  /** Derived from this unit's stage statuses — see `progressFromStages`. */
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

/** One construction stage of one apartment — the unit of progress tracking. */
export interface Stage {
  apt: string
  stage: StageName
  st: StageStatus
  /** Assignee, or '' while unclaimed. */
  who: string
  /** ISO date of the last status change, '' if never moved. */
  at: string
}

export interface Defect {
  id: string
  cat: string
  /**
   * The ჯგუფი inside `cat` — the specific work item the defect is against.
   * Absent for the categories that carry no groups (პარკინგი, აივანი, სხვა …),
   * and on rows written before the two-level taxonomy existed.
   */
  group?: string
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
  /** `S` — სტანდარტი, `P` — პროცესი, taken from the document number. */
  kind: 'S' | 'P'
  rev: string
  updated: string
  /** Length of the source document, shown as a reading-time hint on the card. */
  pages: number
  author: string
  dept: string
}

/** Cover-page fields, as recorded by the department that owns the document. */
export interface StandardMeta {
  kind?: string
  author?: string
  approved?: string
  changed?: string
  version?: string
  dept?: string
  ownerProcess?: string
  ownerDoc?: string
  related?: string
  access?: string
}

/**
 * One piece of a standard's body. Tables keep their first row as the header;
 * a `caption` names a figure the original document referenced.
 */
export type StandardBlock =
  | { type: 'h3'; text: string }
  | { type: 'para'; text: string }
  | { type: 'caption'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][]; cols?: number }
  | { type: 'figure'; src: string }

export interface StandardSection {
  /** `null` for documents that run without numbered sections. */
  title: string | null
  blocks: StandardBlock[]
}

/** A standard's full text, as rendered on its own page. */
export interface StandardDoc {
  code: string
  title: string
  cat: string
  kind: 'S' | 'P'
  pages: number
  meta: StandardMeta
  sections: StandardSection[]
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

export type StageName = (typeof STAGES)[number]

/**
 * The defect taxonomy, two levels deep: a პრობლემის კატეგორია and the ჯგუფები
 * inside it. This is the site's own breakdown of the works, so the wording is
 * theirs verbatim — do not "tidy" a label, the inspectors read these off the
 * acceptance sheets.
 *
 * A category with an empty `groups` carries no second level; the filing form
 * hides its ჯგუფები select entirely rather than showing an empty one.
 */
export const PROBLEM_CATS = [
  {
    cat: 'საიზოლაციო',
    groups: [
      'ხიმინჯის არმირება და სარევიზიო მილი',
      'ხიმინჯის ნაშვერები',
      'ბეტონის მოსამზადებელი ფენა',
      'ხიმინჯის თავების დაბეტონება',
      'საიზოლაციო ფილის ჰიდროიზოლაცია',
      'საიზოლაციო ფილის არმირება',
      'waterstop',
      'ყალიბის სისუფთავე',
      'წყალარინების შველერი',
      'ბეტონის ფილის ზედაპირი',
      'ცივ ნაკერის ჰიდროიზოლაცია და (ჰორიზონტალურად და ვერტიკალურად) გაჯირჯვებადი ლენტი',
      'პერიმეტრის კედლების ჰიდროიზოლაცია',
      'ჩასხმის წინა რევიზია',
    ],
  },
  {
    cat: 'რკ/ბეტონის მონოლითური ელემენტები',
    groups: [
      'სვეტების და კედლების ნაშვერები',
      'სვეტების და კედლების არმირება',
      'გადახურვის ფილის და რიგელების არმირება',
      'ყალიბის სისუფთავე, ნაშვერების სისუფთავე და ბეტონის ზედაპირის დაკენჭვნა',
      'კიბის არმირება',
      'ბეტონის დამცავი შრე',
      'ყალიბის ნარჩენები',
      'განშრევებები და ბეტონის ტანში სამშენებლო ნარჩენები',
      'რკ/ბეტონის ელემენტების გეომეტრია',
      'ქიმიური ანკერი',
      'კარკასში ლითონის კონსტრუქციები',
    ],
  },
  {
    cat: 'არქიტექტურული ნაწილი',
    groups: [
      'იტონგის ბლოკი',
      'ბეტონის ბლოკი',
      'ბლოკის წყობის რკ/ბეტონის კონსტრუქციებთან ჩამაგრება ლითონის ელემენტებით',
      'რკინაბეტონის ზღუდარი',
      'ინტერიერის ნალესის ზედაპირი',
      'იატაკის მოწყობა ( სადემფორმაციო ლენტი და ბგერასაიზოლაციო მემბრანა )',
      'იატაკის მოწყობის ზედაპირი ( ბზარები, ტექნოლოგიური ჭრები და სიმაღლეები )',
      'ბინებში შესასვლელი კარი',
      'იატაკის მოპირკეთება ( კერამოგრანიტი/ბაზალტი )',
      'კიბის საფეხურები და ბაქნების მოპირკეთება',
      'სახანძრო კარი',
      'საკომუნიკაციო შახტის ლუქები',
      'საკომუნიკაციო შახტის კედლები',
      'ჭერის მოხვეწა ( დაზუმფარება )',
      'ლიფტის კარი',
      'კიბის მოაჯირები',
      'სამღებრო სამუშაოები',
      'ობიექტის სისუფთავე',
      'პარკინგის ფილის მოხვეწა ( დაზუმფარება )',
    ],
  },
  {
    cat: 'სახურავი',
    groups: [
      'პარაპეტის კედლები',
      'სახურავის სენდვიჩის შრეები',
      'ჰიდროსაიზოლაციო მემბრანა',
      'სავენტილაციო შახტების თუნუქის ქუდები',
      'პარაპეტის კედლების ქუდები',
    ],
  },
  {
    cat: 'ფასადის მოპირკეთება',
    groups: [
      'მოაჯირები და დეკორატიული ჟალუზები',
      'ლითონის ელემენტების ღებვა',
      'ბლოკის წყობის რკ/ბეტონის კონსტრუქციებთან ჩამაგრება ლითონის ელემენტებით',
      'თუნუქის საცრემლეები',
      'რკ.ბეტონის კარკასის დათბუნება',
      'ფასადის ლესვა და ღებვა',
      'ვენტილირებადი ფასადი',
      'ფასადის მოპირკეთების შრეები',
      'საქვაბის კარადები',
      'ფასადის კედლების ბაზალტით მოპირკეთება',
    ],
  },
  {
    cat: 'ეზოს კეთილმოწყობა',
    groups: [
      'რკ.ბეტონის ელემენტების ჰიდროიზოლაცია',
      'უკუშევსება',
      'გზის საფარის შრეები',
      'ბორდიურები',
      'ვიტრაჟის სავალ ნაწილთან შეუღლების ჰიდროიზოლაცია',
      'პანდუსის ფილის ზედაპირი',
      'რბილი მოედანი',
      'ბეტონის ბილიკის ზედაპირი',
      'ლითონ კონსტრუქციები',
      'სავალი ნაწილის ქვის ფილებით მოპირკეთება',
    ],
  },
  {
    cat: 'უსაფრთხოება',
    groups: [
      'უსაფრთხოების ქამარი',
      'უსაფრთხოების ქუდი (ჩაფხუტი)',
      'პირადი დაცვის აღჭურვილობა',
      'გაუმართავი ხელსაწყოები',
      'მანქანა-დანადგარების პრობლემა (ამწე; ჰპინდერი)',
      'დროებითი დამხმარე საშუალებები',
      'ელექტრო უსაფრთხოება',
      'სახანძრო უსაფრთხოება',
      'საევაკუაციო გეგმა',
      'სიმაღლეზე მუშაობა მოაჯირი',
      'სიმაღლეზე მუშაობა სიცოცხლის ხაზი',
      'სიმაღლეზე მუშაობა - ბადის გამართულობა',
      'დახურული სივრცეები ლიფტის შახტა',
      'დახურული სივრცეები ლუქები',
      'დახურული სივრცეები წყლის რეზერვუარი',
    ],
  },
  {
    cat: 'დასუფთავება',
    groups: [
      'ეზოს დასუფთავება 2 დღე',
      'ეზოს დასუფთავება 3 დღე',
      'ეზოს დასუფთავება 5 დღე',
      'სართულების დასუფთავება 2 დღე',
      'სართულების დასუფთავება 3 დღე',
      'სართულების დასუფთავება 5 დღე',
    ],
  },
  { cat: 'პარკინგი', groups: [] },
  { cat: 'პანდუსი', groups: [] },
  { cat: 'აივანი', groups: [] },
  { cat: 'ტერასა', groups: [] },
  { cat: 'სხვა', groups: [] },
] as const

/** A პრობლემის კატეგორია — the first level of the taxonomy. */
export type ProblemCat = (typeof PROBLEM_CATS)[number]['cat']

/** A ჯგუფი — the second level, across every category. */
export type ProblemGroup = (typeof PROBLEM_CATS)[number]['groups'][number]

/** Category names, in the order the filing form lists them. */
export const CATS: readonly ProblemCat[] = PROBLEM_CATS.map((c) => c.cat)

/** The ჯგუფები under a category — empty for the categories that have none. */
export function groupsFor(cat: string): readonly string[] {
  return PROBLEM_CATS.find((c) => c.cat === cat)?.groups ?? []
}

/**
 * What a stage answers for. Accepting a stage is blocked while any open defect
 * on the apartment matches — that is the QA gate. An entry is either a category
 * (the whole category blocks) or a single ჯგუფი (only that work item blocks),
 * so a stage gates as narrowly as the taxonomy allows: eight of the sixteen
 * stages live under არქიტექტურული ნაწილი and would otherwise all block each
 * other. `'*'` is every defect — Handover cannot be signed off while the unit
 * has a single open one of any kind.
 *
 * The union type is what keeps this honest: a ჯგუფი renamed in PROBLEM_CATS
 * fails the build here rather than silently gating nothing.
 */
export const STAGE_CATS: Record<StageName, readonly (ProblemCat | ProblemGroup | '*')[]> = {
  Structural: ['რკ/ბეტონის მონოლითური ელემენტები'],
  Block: [
    'იტონგის ბლოკი',
    'ბეტონის ბლოკი',
    'ბლოკის წყობის რკ/ბეტონის კონსტრუქციებთან ჩამაგრება ლითონის ელემენტებით',
    'რკინაბეტონის ზღუდარი',
  ],
  Plaster: ['ინტერიერის ნალესის ზედაპირი'],
  'MEP Rough': ['საკომუნიკაციო შახტის ლუქები', 'საკომუნიკაციო შახტის კედლები'],
  Electrical: ['ელექტრო უსაფრთხოება'],
  Plumbing: ['წყალარინების შველერი', 'ცივ ნაკერის ჰიდროიზოლაცია და (ჰორიზონტალურად და ვერტიკალურად) გაჯირჯვებადი ლენტი'],
  Waterproofing: ['საიზოლაციო', 'ჰიდროსაიზოლაციო მემბრანა'],
  Tile: ['იატაკის მოპირკეთება ( კერამოგრანიტი/ბაზალტი )', 'კიბის საფეხურები და ბაქნების მოპირკეთება'],
  Painting: ['სამღებრო სამუშაოები', 'ლითონის ელემენტების ღებვა', 'ფასადის ლესვა და ღებვა'],
  Ceiling: ['ჭერის მოხვეწა ( დაზუმფარება )'],
  Floor: [
    'იატაკის მოწყობა ( სადემფორმაციო ლენტი და ბგერასაიზოლაციო მემბრანა )',
    'იატაკის მოწყობის ზედაპირი ( ბზარები, ტექნოლოგიური ჭრები და სიმაღლეები )',
  ],
  Doors: ['ბინებში შესასვლელი კარი', 'სახანძრო კარი', 'ლიფტის კარი'],
  Kitchen: ['საქვაბის კარადები'],
  Sanitary: ['საიზოლაციო ფილის ჰიდროიზოლაცია', 'პერიმეტრის კედლების ჰიდროიზოლაცია'],
  Cleaning: ['დასუფთავება', 'ობიექტის სისუფთავე'],
  Handover: ['*'],
}

/** Auto-recommendation per defect category — inserted when an inspector picks a category. */
export const RECO: Record<string, string> = {
  'საიზოლაციო': 'ჰიდროიზოლაციის ფენა არ არის დაყვანილი კედელზე მინ. 150 მმ სიმაღლეზე და ნაკერი დაუმუშავებელია. საჭიროა აღდგენა, გაჯირჯვებადი ლენტის ჩაწყობა და 24-სთ წყლის ტესტი.',
  'რკ/ბეტონის მონოლითური ელემენტები': 'ბეტონის ზედაპირზე ფიქსირდება კავერნები და დამცავი შრე ნაკლებია პროექტულზე. საჭიროა გაწმენდა და აღდგენა სარემონტო ნარევით, არმატურის დაფარვის კონტროლით.',
  'არქიტექტურული ნაწილი': 'ელემენტის გადახრა ვერტიკალიდან/დონიდან აღემატება დასაშვებს (3 მმ / 2 მ). საჭიროა უბნის გადაკეთება და ხელახალი მიღება.',
  'სახურავი': 'მემბრანის შეერთება პარაპეტთან არ არის ჰერმეტული. საჭიროა ნაკერის აღდგენა, ქუდის გადამაგრება და წყლით გამოცდა.',
  'ფასადის მოპირკეთება': 'ფასადის ფენების მოწყობა არ შეესაბამება კვანძის დეტალს — ღრეჩო და ჩამაგრება დარღვეულია. საჭიროა კორექტირება პროექტის მიხედვით.',
  'ეზოს კეთილმოწყობა': 'საფარის შრეები და დახრილობა არ შეესაბამება პროექტს, წყალი არ გაედინება. საჭიროა გადაწყობა ნიშნულების დაცვით.',
  'უსაფრთხოება': 'დაფიქსირდა უსაფრთხოების ნორმის დარღვევა. საჭიროა სამუშაოს დაუყოვნებლივი შეჩერება, ხარვეზის აღმოფხვრა და ბრიფინგის ჩატარება.',
  'დასუფთავება': 'უბანი არ არის დასუფთავებული გრაფიკის შესაბამისად. საჭიროა ნარჩენების გატანა და მიღება ფოტოფიქსაციით.',
  'პარკინგი': 'აღწერეთ ხარვეზი და გამოსასწორებელი ღონისძიება.',
  'პანდუსი': 'პანდუსის დახრილობა და ზედაპირი არ შეესაბამება ნორმას. საჭიროა კორექტირება და ხელახალი მიღება.',
  'აივანი': 'აივნის ჰიდროიზოლაცია და დახრილობა არ უზრუნველყოფს წყლის გაყვანას. საჭიროა აღდგენა და წყლის ტესტი.',
  'ტერასა': 'ტერასის ფენების მოწყობა არ შეესაბამება კვანძს. საჭიროა გადაწყობა ჰიდროიზოლაციის აღდგენით.',
  'სხვა': 'აღწერეთ ხარვეზი და გამოსასწორებელი ღონისძიება.',
}

/** The recommendation for a category, falling back to the free-text prompt. */
export function recoFor(cat: string): string {
  return RECO[cat] ?? RECO['სხვა']!
}

export interface QaMember {
  id: string
  name: string
}

/**
 * The QA members a defect can be assigned to. Filing one mails the person
 * picked here, so the list is not cosmetic — `server/team.ts` holds the same
 * three ids with their mailboxes, and the notify endpoint rejects an id it does
 * not recognise. Adding somebody means adding them to both files.
 *
 * Addresses stay server-side: the browser only ever sends the id.
 */
export const QA_TEAM: QaMember[] = [
  { id: 'guji', name: 'გუჯი გვენცაძე' },
  { id: 'paata', name: 'პაატა გვათუა' },
  { id: 'daniel', name: 'დანიელ პაპისმედოვი' },
]

/** Assignee names, for the places that only ever display or seed one. */
export const PEOPLE = QA_TEAM.map((m) => m.name)

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

/**
 * Stage lifecycle, in order. There is no "submitted for review" step: the crews
 * are not users of the system, so nobody hands work over — QA both inspects and
 * records the result, and accepting *is* the inspection. `Delayed` sits off to
 * the side for a stage that stalled after starting.
 */
export const STAGE_FLOW = ['Not Started', 'In Progress', 'Completed'] as const

export type StageStatus = (typeof STAGE_FLOW)[number] | 'Delayed'

export function nextStageStatus(st: StageStatus): StageStatus | null {
  // A stalled stage resumes rather than jumping straight to accepted.
  if (st === 'Delayed') return 'In Progress'
  const i = (STAGE_FLOW as readonly string[]).indexOf(st)
  return i >= 0 && i < STAGE_FLOW.length - 1 ? STAGE_FLOW[i + 1]! : null
}

/** Verb for the button that moves a stage out of its current status. */
export const STAGE_ACTION: Record<StageStatus, string | null> = {
  'Not Started': 'დაწყება',
  'In Progress': 'მიღება',
  Completed: null,
  Delayed: 'განახლება',
}

/** Roles allowed to record stage progress — QA and the management above it. */
export function canTrackStages(role: RoleId | undefined): boolean {
  return role === 'qa' || role === 'admin' || role === 'techdir' || role === 'pm'
}

/** How much of a stage counts as done — the basis of an apartment's progress. */
export function stageWeight(st: StageStatus): number {
  if (st === 'Completed') return 1
  return st === 'Not Started' ? 0 : 0.5
}

/** Apartment completion, 0–100, derived from its stage statuses. */
export function progressFromStages(statuses: StageStatus[]): number {
  if (!statuses.length) return 0
  const done = statuses.reduce((sum, st) => sum + stageWeight(st), 0)
  return Math.round((done / statuses.length) * 100)
}

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
