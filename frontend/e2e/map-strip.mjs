import { chromium } from 'playwright'
const b = await chromium.launch()
let fail = 0
const check = (l,c,d='') => { console.log((c?'  ok   ':'  FAIL ')+l+(c?'':`  ← ${d}`)); if(!c) fail++ }
for (const [name, vp, expect] of [
  ['phone 390', {width:390,height:844}, 'none'],
  ['phablet 540', {width:540,height:900}, 'any'],
  ['tablet 834', {width:834,height:1112}, 'some'],
]) {
  const ctx = await b.newContext({ viewport: vp })
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('qc-session', JSON.stringify({role:'pm',project:'NTB',person:null})))
  await p.goto('http://localhost:5173/map'); await p.waitForTimeout(4000)
  const r = await p.evaluate(() => {
    const units = [...document.querySelectorAll('[aria-hidden] > span.\\@container')]
    const w = units.map(u => Math.round(u.getBoundingClientRect().width))
    const shown = units.map(u => { const s = u.querySelector('span.font-mono'); return (s && getComputedStyle(s).display !== 'none') ? s.innerText.trim() : '' }).filter(Boolean)
    const spill = units.some(u => { const s = u.querySelector('span.font-mono'); if (!s || getComputedStyle(s).display==='none') return false
      const a=s.getBoundingClientRect(), c=u.getBoundingClientRect(); return a.left < c.left-0.5 || a.right > c.right+0.5 })
    return { units: units.length, min: Math.min(...w), max: Math.max(...w), shown: shown.length, sample: shown.slice(0,5), spill }
  })
  console.log(`── ${name}: unit ${r.min}–${r.max}px · ${r.shown}/${r.units} numbered · ${JSON.stringify(r.sample)}`)
  check(`${name}: no number spills`, !r.spill)
  if (expect === 'none') check(`${name}: strip stays clean`, r.shown === 0, `${r.shown} shown at ${r.max}px`)
  if (expect === 'some') check(`${name}: uses the room it has`, r.shown > 0)
  const side = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check(`${name}: no sideways scroll`, !side)
  await p.screenshot({ path: `${process.env.OUT}/strip-${name.split(' ')[0]}.png` })
  await ctx.close()
}
await b.close(); console.log(fail?`\n${fail} FAILED`:'\nstrip: all pass'); process.exit(fail?1:0)
