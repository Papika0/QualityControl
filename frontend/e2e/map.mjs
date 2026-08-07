import { chromium } from 'playwright'
const b = await chromium.launch()
let fail = 0
const check = (l,c,d='') => { console.log((c?'  ok   ':'  FAIL ')+l+(c?'':`  ← ${d}`)); if(!c) fail++ }

for (const [name, vp] of [['960 (nav)',{width:960,height:1000}],['1280',{width:1280,height:1000}],['1440',{width:1440,height:1000}],['1920',{width:1920,height:1100}]]) {
  const ctx = await b.newContext({ viewport: vp })
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('qc-session', JSON.stringify({role:'pm',project:'NTB',person:null})))
  await p.goto('http://localhost:5173/map')
  await p.waitForSelector('[data-cells] button', { timeout: 60000 })
  await p.waitForTimeout(600)

  const r = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-cells] button')]
    const w = cells.map(c => Math.round(c.getBoundingClientRect().width))
    const shown = cells.map(c => {
      const s = c.querySelector('span.font-mono')
      if (!s || getComputedStyle(s).display === 'none') return ''
      return s.innerText.trim()
    })
    // Does any label spill outside its cell?
    const spill = cells.some(c => {
      const s = c.querySelector('span.font-mono')
      if (!s || getComputedStyle(s).display === 'none') return false
      const a = s.getBoundingClientRect(), b = c.getBoundingClientRect()
      return a.width > b.width + 0.5 || a.left < b.left - 0.5 || a.right > b.right + 0.5
    })
    const labelled = shown.filter(Boolean)
    return { min: Math.min(...w), max: Math.max(...w), total: cells.length,
             labelled: labelled.length, sample: labelled.slice(0,6), spill,
             full: labelled.filter(x => x.length >= 3).length }
  })
  console.log(`── ${name}: cell ${r.min}–${r.max}px · ${r.labelled}/${r.total} labelled (${r.full} full) · e.g. ${JSON.stringify(r.sample)}`)
  check(`${name}: no label spills its cell`, !r.spill)
  if (r.min >= 44) check(`${name}: full numbers where cells are wide`, r.full > 0)
  if (r.max < 26) check(`${name}: hidden when too narrow`, r.labelled === 0)
  await p.screenshot({ path: `${process.env.OUT}/map-${name.split(' ')[0]}.png` })
  await ctx.close()
}
await b.close()
console.log(fail ? `\n${fail} FAILED` : '\nmap labels: all pass')
process.exit(fail?1:0)
