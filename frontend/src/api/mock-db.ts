// Deterministic in-memory "database" generating the same demo dataset as the
// approved prototype. Every value derives from a stable string hash, so lists,
// counts and statuses stay consistent between reloads and across views.

import { hash01 } from '@/lib/utils'
import {
  CATS, PEOPLE, RECO, ROOMS, SUBS, TASK_TYPES,
  type Apartment, type Defect, type DocRow, type Priority, type ProjectId,
  type Standard, type Task,
} from '@/data/domain'

const aptCache = new Map<ProjectId, Apartment[]>()

export function getApartments(proj: ProjectId): Apartment[] {
  const cached = aptCache.get(proj)
  if (cached) return cached
  const top = proj === 'NTB' ? 21 : 16
  const perFloor = (f: number) => (proj === 'NTB' ? (f === 14 ? 18 : 17) : 8)
  const out: Apartment[] = []
  for (let f = top; f >= 1; f--) {
    for (let i = 1; i <= perFloor(f); i++) {
      const no = `${f}${String(i).padStart(2, '0')}`
      const k = proj + no
      const prog = Math.max(0, Math.min(100, Math.round(104 - (f - 1) * (top === 21 ? 4.6 : 5.8) + hash01(k) * 16)))
      const defects = prog > 96 || prog < 8 ? 0 : Math.floor(hash01(k + 'd') * 4.4)
      out.push({
        no,
        floor: f,
        prog,
        defects,
        sold: hash01(k + 's') > 0.55,
        late: hash01(k + 'l') > 0.87 && prog < 95 && prog > 10,
        area: 44 + Math.round(hash01(k + 'a') * 52),
        rooms: 1 + Math.round(hash01(k + 'r') * 2),
      })
    }
  }
  aptCache.set(proj, out)
  return out
}

export function defectsForApt(proj: ProjectId, no: string, limit?: number): Defect[] {
  const n = 1 + Math.floor(hash01(proj + no + 'q') * 3)
  const out: Defect[] = []
  for (let i = 0; i < n; i++) {
    const k = proj + no + 'q' + i
    const cat = CATS[Math.floor(hash01(k + 'c') * CATS.length)]!
    out.push({
      id: `QA-${no}-${String(17 + i * 4).padStart(3, '0')}`,
      cat,
      apt: no,
      room: ROOMS[Math.floor(hash01(k + 'r') * 5)]!,
      pri: (['high', 'med', 'low'] as Priority[])[Math.floor(hash01(k + 'p') * 3)]!,
      st: (['ღია', 'მიმდინარე', 'შემოწმებაზე', 'დახურული'] as const)[Math.floor(hash01(k + 's') * 4)]!,
      who: PEOPLE[Math.floor(hash01(k + 'w') * 7)]!,
      sub: SUBS[Math.floor(hash01(k + 'u') * 4)]!,
      due: `2026-0${7 + Math.floor(hash01(k + 'd') * 2)}-${String(4 + Math.floor(hash01(k + 'e') * 22)).padStart(2, '0')}`,
      desc: (RECO[cat] ?? RECO.Other!).split('.')[0] + '.',
    })
  }
  return limit === undefined ? out : out.slice(0, limit)
}

const defCache = new Map<ProjectId, Defect[]>()

export function getAllDefects(proj: ProjectId): Defect[] {
  const cached = defCache.get(proj)
  if (cached) return cached
  let all: Defect[] = []
  getApartments(proj)
    .filter((a) => a.defects > 0)
    .slice(0, 48)
    .forEach((a) => {
      all = all.concat(defectsForApt(proj, a.no, a.defects))
    })
  defCache.set(proj, all)
  return all
}

export const TASKS: Task[] = [
  { id: 'T-2101', title: 'კერამოგრანიტის შემოწმება — დერეფანი', loc: 'მე-10 სართ.', who: 'თ. აბულაძე', due: '12 აგვ', col: 'new', pri: 'med', floor: 10, type: 'კერამოგრანიტის შემოწმება' },
  { id: 'T-2102', title: 'ლიფტის კარებების მონტაჟის შემოწმება', loc: 'მე-5 სართ.', who: 'ზ. ხურციძე', due: '10 აგვ', col: 'new', pri: 'med', floor: 5, type: 'ლიფტის მონტაჟის შემოწმება' },
  { id: 'T-2103', title: 'შავი ბლოკის წყობის შემოწმება', loc: 'მე-17 სართ.', who: 'ლ. ჩხეიძე', due: '15 აგვ', col: 'prog', pri: 'high', floor: 17, type: 'წყობის შემოწმება' },
  { id: 'T-2104', title: 'ელექტროობის კაბელების დაქსელვის შემოწმება', loc: 'მე-11 სართ.', who: 'ი. მაისურაძე', due: '30 ივლ', col: 'prog', pri: 'high', floor: 11, type: 'ელექტროობის შემოწმება' },
  { id: 'T-2105', title: 'ელექტრო კოლოფების რაოდენობის შემოწმება', loc: 'მე-11 სართ.', who: 'ი. მაისურაძე', due: '11 აგვ', col: 'prog', pri: 'med', floor: 11, type: 'ელექტროობის შემოწმება' },
  { id: 'T-2108', title: 'ჰაერსატარების, კანალიზაციისა და წყალგაყვანილობის მილების გადმოსვლის (10 სმ) შემოწმება', loc: 'მე-14 · 18 ბინა', who: 'გ. კვარაცხელია', due: '08 აგვ', col: 'prog', pri: 'high', floor: 14, type: TASK_TYPES[1]! },
  { id: 'T-2106', title: 'აივნის ფასადების შემოწმება', loc: 'მე-9 სართ.', who: 'გ. კვარაცხელია', due: '05 აგვ', col: 'check', pri: 'med', floor: 9, type: 'ფასადის შემოწმება' },
  { id: 'T-2107', title: 'MEP — დაქსელილი წყლის მილების ტესტირების ჩაბარება', loc: 'მე-8 სართ.', who: 'ი. მაისურაძე', due: '30 ივლ', col: 'done', pri: 'med', floor: 8, type: 'MEP ტესტირება' },
]

export const STANDARDS: Standard[] = [
  { code: 'STD-01', title: 'მონოლითური ბეტონის მიღების სტანდარტი', cat: 'კონსტრუქცია', files: ['PDF', 'DWG'], rev: 'v3', updated: '12 მაი 2026' },
  { code: 'STD-02', title: 'ბლოკის წყობის ნორმები — ვერტიკალობა და შვები', cat: 'წყობა', files: ['PDF'], rev: 'v2', updated: '03 ივნ 2026' },
  { code: 'STD-03', title: 'ელექტროკაბელის დაქსელვისა და კოლოფების სტანდარტი', cat: 'ელექტროობა', files: ['PDF', 'DOCX'], rev: 'v4', updated: '28 ივნ 2026' },
  { code: 'STD-04', title: 'მილების გადმოსვლა გადახურვიდან — 10 სმ ნორმა (ჰაერსატარი, კანალიზაცია, წყალი)', cat: 'MEP / სანტექნიკა', files: ['PDF', 'DWG'], rev: 'v1', updated: '15 ივლ 2026' },
  { code: 'STD-05', title: 'ჰიდროიზოლაციის მოწყობა სველ წერტილებში', cat: 'MEP / სანტექნიკა', files: ['PDF'], rev: 'v3', updated: '20 აპრ 2026' },
  { code: 'STD-06', title: 'კერამოგრანიტის მოპირკეთების სტანდარტი', cat: 'მოპირკეთება', files: ['PDF', 'DOCX'], rev: 'v2', updated: '07 ივლ 2026' },
  { code: 'STD-07', title: 'ვენტილირებადი ფასადის მონტაჟის ნორმები', cat: 'ფასადი', files: ['PDF', 'DWG', 'DOCX'], rev: 'v1', updated: '30 ივნ 2026' },
  { code: 'STD-08', title: 'ლიფტის შახტისა და კარებების მონტაჟის ნორმები', cat: 'მონტაჟი', files: ['PDF'], rev: 'v1', updated: '22 ივლ 2026' },
]

export const DRAWINGS: DocRow[] = [
  { code: 'AR-101', name: 'არქიტექტურა — გეგმები, კორპუსი A', meta: 'DWG + PDF · 214 ფურც.', rev: 'rev. D', st: 'დამტკიცებული' },
  { code: 'AR-102', name: 'არქიტექტურა — ფასადები', meta: 'PDF · 48 ფურც.', rev: 'rev. C', st: 'დამტკიცებული' },
  { code: 'KJ-201', name: 'კონსტრუქციული — კარკასი', meta: 'DWG · 156 ფურც.', rev: 'rev. E', st: 'დამტკიცებული' },
  { code: 'MEP-E-09', name: 'ელექტროობა — სართ. 9-16', meta: 'DWG · 64 ფურც.', rev: 'rev. C', st: 'განხილვაში' },
  { code: 'MEP-P-04', name: 'სანტექნიკა — სადგამები', meta: 'PDF · 38 ფურც.', rev: 'rev. B', st: 'დამტკიცებული' },
  { code: 'HVAC-02', name: 'ვენტილაცია — საერთო ზონები', meta: 'DWG · 29 ფურც.', rev: 'rev. B', st: 'გადამუშავებაზე' },
  { code: 'FF-01', name: 'სახანძრო უსაფრთხოება', meta: 'PDF · 52 ფურც.', rev: 'rev. A', st: 'დამტკიცებული' },
  { code: 'LS-01', name: 'კეთილმოწყობა / ლანდშაფტი', meta: 'PDF · 18 ფურც.', rev: 'rev. A', st: 'განხილვაში' },
]

export const OWNER_DOCS: DocRow[] = [
  { code: 'CTR-1204', name: 'ნასყიდობის ხელშეკრულება', meta: 'PDF · 2.1 MB', rev: 'v1', st: 'ხელმოწერილი' },
  { code: 'PLAN-1204', name: 'ბინის გეგმა A-1204', meta: 'PDF · 4.8 MB', rev: 'rev. C', st: 'დამტკიცებული' },
  { code: 'ACT-1204', name: 'მიღება-ჩაბარების აქტი (დრაფტი)', meta: 'მომზადდება ჩაბარებისას', rev: '—', st: 'განხილვაში' },
  { code: 'WRN-1204', name: 'გარანტიის პირობები', meta: 'PDF · 0.4 MB', rev: 'v2', st: 'ძალაშია' },
]

export interface ArchiveRow {
  ext: string
  name: string
  meta: string
  amt: string
  st: string
}

export const ARCHIVE: ArchiveRow[] = [
  { ext: 'PDF', name: 'ხელშეკრულება — შპს ალიანს-მშენი', meta: 'ხელშეკრულება · 12 მარ 2026', amt: '$412,000', st: 'ძალაშია' },
  { ext: 'PDF', name: 'ხელშეკრულება — შპს ტექნო-ინსტალაცია', meta: 'ხელშეკრულება · 02 აპრ 2026', amt: '$268,500', st: 'ძალაშია' },
  { ext: 'PDF', name: 'ფარული სამუშაოების აქტი — B-0405', meta: 'აქტი · 18 ივლ 2026', amt: '—', st: 'ხელმოწერილი' },
  { ext: 'XLS', name: 'შესრულებული სამუშაოს აქტი №14', meta: 'აქტი · 25 ივლ 2026', amt: '$96,400', st: 'განხილვაში' },
  { ext: 'PDF', name: 'ინვოისი INV-2214', meta: 'ინვოისი · 30 ივლ 2026', amt: '$48,200', st: 'გადახდილი' },
  { ext: 'PDF', name: 'ინვოისი INV-2219', meta: 'ინვოისი · 31 ივლ 2026', amt: '$22,750', st: 'გამოწერილი' },
  { ext: 'PDF', name: 'ექსპერტიზის დასკვნა — კარკასი', meta: 'ცნობა · 14 ივნ 2026', amt: '—', st: 'ძალაშია' },
  { ext: 'IMG', name: 'ობიექტის დაზღვევის პოლისი', meta: 'ცნობა · 01 მარ 2026', amt: '—', st: 'ძალაშია' },
]

export interface ContractRow {
  sub: string
  scope: string
  pct: number
  amt: string
  paid: string
  st: string
}

export const CONTRACTS: ContractRow[] = [
  { sub: 'შპს ალიანს-მშენი', scope: 'მოპირკეთება · სველი წერტილები', pct: 68, amt: '$412,000', paid: '$276,000', st: 'ძალაშია' },
  { sub: 'შპს ტექნო-ინსტალაცია', scope: 'ელექტროობა · სუსტი დენები', pct: 74, amt: '$268,500', paid: '$198,700', st: 'ძალაშია' },
  { sub: 'შპს ფასად-პრო', scope: 'ფასადი · მოჭიქვა', pct: 81, amt: '$524,000', paid: '$419,000', st: 'ძალაშია' },
  { sub: 'ი/მ ჯ. წიკლაური', scope: 'სანტექნიკა — სად. A2', pct: 55, amt: '$96,000', paid: '$48,000', st: 'განხილვაში' },
]

export interface AuditRow {
  t: string
  action: string
  detail: string
  who: string
}

export const AUDIT_LOG: AuditRow[] = [
  { t: '2026-08-01 09:42', action: 'ფოტო დაემატა (2)', detail: 'QA-1204-017 · After', who: 'გ. კვარაცხელია' },
  { t: '2026-08-01 09:15', action: 'PDF გენერირდა და გაიგზავნა', detail: 'QA კვირის ანგარიში · 4 მიმღები', who: 'სისტემა' },
  { t: '2026-08-01 08:58', action: 'სტატუსი შეიცვალა', detail: 'QA-0712-021 → შემოწმებაზე', who: 'ლ. ჩხეიძე' },
  { t: '2026-07-31 17:40', action: 'დოკუმენტი აიტვირთა', detail: 'MEP-E-09 rev. C — ვიზირების ჯაჭვი დაიწყო', who: 'ნ. ბერიძე' },
  { t: '2026-07-31 16:22', action: 'როლის უფლება შეიცვალა', detail: 'ქვეკონტრაქტორი: ფინანსები → დამალული', who: 'სისტემის ადმინი' },
  { t: '2026-07-31 14:05', action: 'დავალება მიენიჭა', detail: 'T-1188 → თ. აბულაძე · ვადა 22 აგვ', who: 'ნ. ბერიძე' },
  { t: '2026-07-30 18:11', action: 'წაშლის მცდელობა (უარყოფილია)', detail: 'QA-0611-013 — არასაკმარისი უფლება', who: 'ლ. ჩხეიძე' },
  { t: '2026-07-30 11:47', action: 'ინვოისი დარეგისტრირდა', detail: 'INV-2214 · შპს ალიანს-მშენი · $48,200', who: 'ბუღალტერია' },
  { t: '2026-07-29 10:02', action: 'ბინა ჩაბარდა', detail: 'ბინა 402 · Handover აქტი ხელმოწერილია', who: 'ნ. ბერიძე' },
  { t: '2026-07-28 15:30', action: 'ახალი მომხმარებელი', detail: 'გ. წერეთელი · როლი: ზედამხედველი', who: 'სისტემის ადმინი' },
]

export interface UserRow {
  ini: string
  name: string
  mail: string
  role: string
  scope: string
  active: boolean
}

export const USERS: UserRow[] = [
  { ini: 'ნბ', name: 'ნინო ბერიძე', mail: 'n.beridze@company.ge', role: 'პროექტის მენეჯერი', scope: 'VKR · SBP', active: true },
  { ini: 'გკ', name: 'გიორგი კვარაცხელია', mail: 'g.kvara@company.ge', role: 'ზედამხედველი', scope: 'VKR', active: true },
  { ini: 'თა', name: 'თემურ აბულაძე', mail: 't.abuladze@company.ge', role: 'ტექ. დირექტორი', scope: 'ყველა', active: true },
  { ini: 'ლჩ', name: 'ლევან ჩხეიძე', mail: 'l.chkheidze@alians.ge', role: 'ქვეკონტრაქტორი', scope: 'VKR · შეზღუდული', active: false },
  { ini: 'დგ', name: 'დავით გოგოლაძე', mail: 'd.gogoladze@gmail.com', role: 'მფლობელი (Portal)', scope: 'A-1204', active: false },
]
