import { cn } from '@/lib/utils'

export interface ToggleOption {
  value: string
  label: string
}

/**
 * Multi-select as a row of pressable pills — the pattern the defect form
 * already uses for notification channels, generalised. Preferred over a
 * `<select multiple>` because floors and apartments are picked by tapping on
 * site, one-handed, and a pill row shows the whole selection at a glance.
 */
function ToggleGroup({
  options,
  value,
  onChange,
  disabled,
  className,
  empty = 'ვარიანტი არ არის',
}: {
  options: ToggleOption[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  className?: string
  empty?: string
}) {
  if (!options.length) {
    return <div className="py-1.75 text-[11px] text-mut-2">{empty}</div>
  }

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <div className={cn('flex flex-wrap gap-1.5 py-1.75', className)}>
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(o.value)}
            className={cn(
              'rounded-full border px-2.75 py-1 text-[10.5px] transition-colors',
              disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
              on
                ? 'border-brand-ring bg-brand-soft font-bold text-brand-dark'
                : 'border-line-2 bg-card font-semibold text-mut-2 hover:border-brand-ring hover:text-mut-3',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export { ToggleGroup }
