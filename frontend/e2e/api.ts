// Drives the real task API end-to-end through the same code path the UI calls.
// In Node there is no `indexedDB`, so `openBackend` falls back to MemoryBackend
// and the whole seed + client stack runs unchanged.

import { api } from '@/api/client'
import { visibleTasks, taskAction, canEditTask, canTickChecklist, canSeeTask } from '@/lib/task-perms'
import type { TaskActor } from '@/lib/task-perms'
import type { Task } from '@/data/domain'

const actor = (role: any, personId: string | null = null, name = role): TaskActor => ({
  role,
  personId,
  name,
})

const PMDIR = actor('pmdir', null, 'პროექტების მართვის დირექტორი')
const PFM = actor('pfm', null, 'პორტფოლიო მენეჯერი')
const PM = actor('pm', null, 'პროექტის მენეჯერი')
const GUJI = actor('qa', 'guji', 'გუჯი გვენცაძე')
const PAATA = actor('qa', 'paata', 'პაატა გვათუა')
const TECHDIR = actor('techdir', null, 'ტექნიკური დირექტორი')
const DANIEL_TS = actor('techsup', 'daniel', 'დანიელ პაპისმედოვი')
const PAATA_TS = actor('techsup', 'paata', 'პაატა გვათუა')

let failures = 0
function check(label: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok   ${label}`)
  else {
    failures++
    console.log(`  FAIL ${label} ${detail}`)
  }
}

const cols = (a: TaskActor, all: Task[]) => {
  const v = visibleTasks(a, all)
  const by: Record<string, number> = {}
  for (const t of v) by[t.col] = (by[t.col] ?? 0) + 1
  return `${v.length} total ${JSON.stringify(by)}`
}

async function main() {
  console.log('\n=== seed loads, project-scoped ===')
  const ntb = await api.tasks.list('NTB')
  const sbp = await api.tasks.list('SBP')
  const btm = await api.tasks.list('BTM')
  console.log(`  NTB=${ntb.length} SBP=${sbp.length} BTM=${btm.length}`)
  check('NTB has rows', ntb.length === 12)
  check('SBP has rows', sbp.length === 2)
  check('BTM has rows', btm.length === 2)
  check('no id collisions across projects', new Set([...ntb, ...sbp, ...btm].map((t) => t.id)).size === 16)
  check('assignees come from QA_TEAM', ntb.every((t) => !t.whoId || ['guji', 'paata', 'daniel'].includes(t.whoId)))

  console.log('\n=== visibility per role (NTB) ===')
  for (const [name, a] of [
    ['pmdir', PMDIR], ['pfm', PFM], ['pm', PM], ['qa/guji', GUJI], ['qa/paata', PAATA],
    ['techdir', TECHDIR], ['techsup/daniel', DANIEL_TS], ['techsup/paata', PAATA_TS],
  ] as const) {
    console.log(`  ${name.padEnd(15)} ${cols(a, ntb)}`)
  }
  check('supervisor sees no requests', visibleTasks(GUJI, ntb).every((t) => t.col !== 'req'))
  check('supervisor sees only own', visibleTasks(GUJI, ntb).every((t) => t.whoId === 'guji'))
  check('pm/pmdir/pfm never see tech track', [PM, PMDIR, PFM].every((a) => visibleTasks(a, ntb).every((t) => t.track === 'main')))
  check('techsup/paata cannot see daniel tech task', !visibleTasks(PAATA_TS, ntb).some((t) => t.track === 'tech'))
  check('techsup sees main flow from ახალი on', visibleTasks(DANIEL_TS, ntb).some((t) => t.track === 'main' && t.col !== 'req'))
  check('techdir sees the tech task', visibleTasks(TECHDIR, ntb).some((t) => t.track === 'tech'))

  console.log('\n=== pmdir files a request ===')
  const req = await api.tasks.create(
    'NTB',
    { title: 'ტესტ მოთხოვნა', desc: 'აღწერა', track: 'main', col: 'req', pri: 'high',
      floors: [12], apts: [], whoId: null, who: '' },
    PMDIR.name,
  )
  console.log(`  created ${req.id} col=${req.col} who=${req.whoId}`)
  check('lands in req, unassigned', req.col === 'req' && req.whoId === null)
  check('invisible to supervisor', !canSeeTask(GUJI, req))
  check('visible to pm', canSeeTask(PM, req))
  check('pmdir cannot tick', !canTickChecklist(PMDIR, req))

  console.log('\n=== publish gate ===')
  let blocked = await api.tasks.advance('NTB', req.id, PM.name)
  check('refused with no assignee', !blocked.ok && blocked.blockedBy === 'assignee', `got ${blocked.blockedBy}`)

  await api.tasks.update('NTB', req.id, { whoId: 'guji', who: GUJI.name })
  blocked = await api.tasks.advance('NTB', req.id, PM.name)
  check('refused with no breakdown', !blocked.ok && blocked.blockedBy === 'breakdown', `got ${blocked.blockedBy}`)

  await api.tasks.update('NTB', req.id, {
    checklist: [
      { id: 'x1', text: 'პუნქტი 1', done: false, by: '', at: '' },
      { id: 'x2', text: 'პუნქტი 2', done: false, by: '', at: '' },
    ],
  })
  const published = await api.tasks.advance('NTB', req.id, PM.name)
  check('publishes once assigned + broken down', published.ok && published.task?.col === 'new')

  console.log('\n=== supervisor works it ===')
  let cur = published.task!
  check('now visible to guji', canSeeTask(GUJI, cur))
  check('still invisible to paata', !canSeeTask(PAATA, cur))
  check('guji cannot edit', !canEditTask(GUJI, cur))
  check('pm can edit', canEditTask(PM, cur))
  check('guji action is start', taskAction(GUJI, cur, 0)?.kind === 'start')

  cur = (await api.tasks.advance('NTB', cur.id, GUJI.name)).task!
  check('started without pm confirm', cur.col === 'prog')
  cur = (await api.tasks.toggleChecklist('NTB', cur.id, 'x1', true, GUJI.name))!
  check('tick records who + when', cur.checklist[0]!.done && cur.checklist[0]!.by === GUJI.name && !!cur.checklist[0]!.at)

  const pmWaiting = taskAction(PM, cur, 0)
  check('pm blocked until ready', pmWaiting?.kind === 'confirm' && !!pmWaiting.disabled, pmWaiting?.disabled ?? '')
  const stuck = await api.tasks.advance('NTB', cur.id, PM.name)
  check('api refuses unready advance', !stuck.ok && stuck.blockedBy === 'ready')

  cur = (await api.tasks.setReady('NTB', cur.id, true, GUJI.name))!
  check('ready stamped', cur.gate.ready?.by === GUJI.name)
  cur = (await api.tasks.advance('NTB', cur.id, PM.name)).task!
  check('pm confirmed to check', cur.col === 'check')
  check('ready cleared on move', !cur.gate.ready)

  console.log('\n=== tech gate into done ===')
  cur = (await api.tasks.setReady('NTB', cur.id, true, GUJI.name))!
  const needTech = await api.tasks.advance('NTB', cur.id, PM.name)
  check('refused without techOk', !needTech.ok && needTech.blockedBy === 'tech', `got ${needTech.blockedBy}`)
  const pmAction = taskAction(PM, cur, 0)
  check('button says why', pmAction?.disabled === 'საჭიროა ტექნიკური დადასტურება', pmAction?.disabled ?? '')

  cur = (await api.tasks.setTechOk('NTB', cur.id, TECHDIR.name))!
  const closed = await api.tasks.advance('NTB', cur.id, PM.name)
  check('closes once vouched', closed.ok && closed.task?.col === 'done')
  check('techOk is sticky', !!closed.task?.gate.techOk)
  check('history recorded every step', (closed.task?.history ?? []).map((h) => h.col).join('>') === 'req>new>prog>check>done',
    (closed.task?.history ?? []).map((h) => h.col).join('>'))

  console.log('\n=== tech track closes without techOk ===')
  const tech = (await api.tasks.list('NTB')).find((t) => t.track === 'tech' && t.col === 'prog')!
  check('techsup/daniel owns it', taskAction(DANIEL_TS, tech, 0)?.kind === 'ready')
  check('techdir confirms, not pm', taskAction(TECHDIR, tech, 0)?.kind === 'confirm')
  let tt = (await api.tasks.setReady('NTB', tech.id, true, DANIEL_TS.name))!
  tt = (await api.tasks.advance('NTB', tt.id, TECHDIR.name)).task!
  check('to check', tt.col === 'check')
  tt = (await api.tasks.setReady('NTB', tt.id, true, DANIEL_TS.name))!
  const techDone = await api.tasks.advance('NTB', tt.id, TECHDIR.name)
  check('tech task closes with no techOk', techDone.ok && techDone.task?.col === 'done' && !techDone.task?.gate.techOk)

  console.log('\n=== sub-tasks ===')
  const parent = (await api.tasks.list('NTB')).find((t) => t.id === 'T-2105')!
  const kids = await api.tasks.children('NTB', parent.id)
  check('seeded parent has children', kids.length === 2, `got ${kids.length}`)
  const child = await api.tasks.create(
    'NTB',
    { title: 'ქვე', desc: '', track: 'main', col: 'new', pri: 'low', floors: [17], apts: [],
      whoId: 'paata', who: PAATA.name, parentId: parent.id, checklist: ['ერთი'] },
    PM.name,
  )
  check('child carries parentId', child.parentId === parent.id)
  check('child routes to its own supervisor', canSeeTask(PAATA, child) && !canSeeTask(GUJI, child))

  console.log('\n=== breakdown via children only ===')
  const req2 = await api.tasks.create(
    'NTB',
    { title: 'მოთხოვნა 2', desc: '', track: 'main', col: 'req', pri: 'med', floors: [3],
      apts: [], whoId: 'guji', who: GUJI.name },
    PFM.name,
  )
  const noKids = await api.tasks.advance('NTB', req2.id, PM.name)
  check('no checklist, no children → blocked', !noKids.ok && noKids.blockedBy === 'breakdown')
  await api.tasks.create(
    'NTB',
    { title: 'ქვე-2', desc: '', track: 'main', col: 'new', pri: 'med', floors: [3], apts: [],
      whoId: 'guji', who: GUJI.name, parentId: req2.id },
    PM.name,
  )
  const withKid = await api.tasks.advance('NTB', req2.id, PM.name)
  check('a child alone satisfies the gate', withKid.ok && withKid.task?.col === 'new')

  console.log('\n=== regressions found in review ===')
  const { floorLabel, taskLocation, TASK_FLOW } = await import('@/data/domain')
  const { canSeeRequests } = await import('@/lib/task-perms')
  check('floor 1 is 1-ლი not მე-1', floorLabel(1) === '1-ლი' && floorLabel(9) === 'მე-9')
  check('location reads whole-floor', taskLocation({ floors: [1, 14], apts: [] }) === '1-ლი, მე-14 სართ.')
  check('location lists apartments', taskLocation({ floors: [14], apts: ['1418'] }) === 'მე-14 სართ. · 1418')

  // A card must never land in a column its board does not render.
  const adminA = actor('admin', null, 'ადმინი')
  const techReq = await api.tasks.create(
    'NTB',
    { title: 'ტექ. მოთხოვნა', desc: '', track: 'tech', col: 'req', pri: 'low', floors: [2],
      apts: [], whoId: null, who: '' },
    adminA.name,
  )
  const techdirSees = visibleTasks(TECHDIR, await api.tasks.list('NTB'))
  const hasReqCard = techdirSees.some((t) => t.id === techReq.id)
  const cols2 = TASK_FLOW.filter(
    (c) => c !== 'req' || canSeeRequests(TECHDIR) || techdirSees.some((t) => t.col === 'req'),
  )
  check('techdir sees the tech request', hasReqCard)
  check('…and its column is rendered', !hasReqCard || cols2.includes('req'))
  check('supervisor still gets 4 columns',
    TASK_FLOW.filter((c) => c !== 'req' || canSeeRequests(GUJI) ||
      visibleTasks(GUJI, ntb).some((t) => t.col === 'req')).length === 4)

  // A person on both rosters must be able to start their own task either way.
  const mainForDaniel = await api.tasks.create(
    'NTB',
    { title: 'დანიელის მთავარი', desc: '', track: 'main', col: 'new', pri: 'low', floors: [4],
      apts: [], whoId: 'daniel', who: 'დანიელ პაპისმედოვი', checklist: ['ა'] },
    PM.name,
  )
  check('techsup can start a main task assigned to them',
    taskAction(DANIEL_TS, mainForDaniel, 0)?.kind === 'start')

  console.log('\n=== comments ===')
  const c = await api.tasks.addComment('T-2103', GUJI.name, 'ტესტ კომენტარი')
  const list = await api.tasks.comments('T-2103')
  check('comment stored', list.length === 1 && list[0]!.id === c.id)
  check('task photos start empty', (await api.tasks.photos('T-2103')).length === 0)

  console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
