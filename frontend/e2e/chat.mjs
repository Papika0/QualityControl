import { chromium } from 'playwright'
const b = await chromium.launch()
let fail = 0
const check = (l, c, d='') => { console.log((c?'  ok   ':'  FAIL ')+l+(c?'':`  ← ${d}`)); if(!c) fail++ }

for (const [name, vp] of [['phone',{width:390,height:844}],['desktop',{width:1440,height:900}]]) {
  const ctx = await b.newContext({ viewport: vp })
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('qc-session', JSON.stringify({role:'qa',project:'NTB',person:'guji'})))
  await p.goto('http://localhost:5173/tasks')
  await p.waitForSelector('[data-testid="task-board"]', { timeout: 60000, state: 'attached' })
  await p.keyboard.press(process.platform === 'darwin' ? 'Meta+j' : 'Control+j')
  await p.waitForTimeout(500)

  // Inject an answer containing the exact percent-encoded link from the report,
  // as a bare path — the case the renderer must now name and wrap.
  await p.evaluate(() => {
    const ta = document.querySelector('textarea, input[type="text"]')
    if (ta) { ta.focus() }
  })
  await p.fill('textarea, input[type=text]', 'რა არის ჩემი დღევანდელი მიზანი?')
  await p.keyboard.press('Enter')
  await p.waitForTimeout(14000)
  await p.screenshot({ path: `${process.env.OUT}/chat-${name}.png` })

  const panel = await p.evaluate(() => {
    const bubbles = [...document.querySelectorAll('div')].filter(d => d.className.includes?.('rounded-xl') && d.className.includes('leading-relaxed'))
    const last = bubbles[bubbles.length-1]
    if (!last) return null
    const host = last.closest('[class*="overflow-y-auto"]') ?? last.parentElement
    return {
      text: last.innerText.slice(0, 400),
      bubbleRight: Math.round(last.getBoundingClientRect().right),
      hostRight: Math.round(host.getBoundingClientRect().right),
      sideways: host.scrollWidth > host.clientWidth + 1,
      links: [...last.querySelectorAll('button')].map(x => x.innerText.trim()).filter(Boolean),
    }
  })
  console.log(`── ${name}`)
  if (!panel) { check(`${name}: bubble found`, false); await ctx.close(); continue }
  check(`${name}: nothing scrolls sideways`, !panel.sideways)
  check(`${name}: bubble inside the panel`, panel.bubbleRight <= panel.hostRight + 1, `${panel.bubbleRight} vs ${panel.hostRight}`)
  check(`${name}: no raw %XX shown`, !/%[0-9A-F]{2}/i.test(panel.text), (panel.text.match(/%[0-9A-F]{2}.{0,30}/i)||[''])[0])
  const longest = Math.max(0, ...panel.links.map(l => l.length))
  check(`${name}: link labels are readable`, longest > 0 && longest < 60, `labels=${JSON.stringify(panel.links)}`)
  console.log(`     labels: ${JSON.stringify(panel.links)}`)
  await ctx.close()
}
await b.close()
console.log(fail ? `\n${fail} FAILED` : '\nchat rendering: all pass')
process.exit(fail?1:0)
