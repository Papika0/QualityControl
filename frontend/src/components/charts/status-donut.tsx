import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

export interface DonutSlice {
  name: string
  value: number
  /** Arc fill — pass a `--color-arc-*` token, not a status tone. */
  color: string
}

/**
 * Part-to-whole donut.
 *
 * The things that make a donut unreadable, and what is done about each:
 *  - identity by color alone → every slice is direct-labelled in the legend with
 *    its own count and share, so the arc colors only reinforce;
 *  - a tooltip covering the hole → there is no tooltip. The hole holds the total,
 *    and swaps to a slice's own figure while that slice is hovered;
 *  - legend order drifting from arc order → both render from one array, and the
 *    arcs start at 12 o'clock and run clockwise, so they agree by construction;
 *  - segments bleeding together → a 2px surface-colored gap between arcs.
 */
export function StatusDonut({
  data,
  total,
  onSelect,
}: {
  data: DonutSlice[]
  total: number
  onSelect?: (name: string) => void
}) {
  const [active, setActive] = useState<number | null>(null)
  const shown = active === null ? null : data[active]
  const share = (v: number) => Math.round((v / Math.max(total, 1)) * 100)

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-36 w-36 flex-none">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={2}
              stroke="var(--color-card)"
              strokeWidth={2}
              isAnimationActive={false}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.name}
                  fill={d.color}
                  cursor={onSelect ? 'pointer' : undefined}
                  opacity={active === null || active === i ? 1 : 0.3}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onSelect?.(d.name)}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Hole: the total, or the hovered slice's own figures. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-display text-2xl font-extrabold leading-none">
              {shown ? shown.value : total}
            </div>
            <div className="mt-1 max-w-24 truncate text-[10px] text-mut-2">
              {shown ? `${share(shown.value)}% · ${shown.name}` : 'სულ ხარვეზი'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-x-3 gap-y-1">
        {data.map((d, i) => (
          <button
            key={d.name}
            onClick={() => onSelect?.(d.name)}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] hover:bg-soft"
          >
            <span className="h-2 w-2 flex-none rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="font-mono text-mut">{d.value}</span>
            <span className="w-7 text-right text-mut-2">{share(d.value)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
