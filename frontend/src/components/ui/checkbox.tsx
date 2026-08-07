import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A ticked box with its label. Not Radix — the project only carries the three
 * Radix packages it already uses, and a checkbox is a button with an
 * `aria-checked` on it.
 */
function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  label,
  hint,
  className,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  label: ReactNode
  /** Small line under the label — who ticked it, and when. */
  hint?: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-1 py-1 text-left text-sm',
        disabled ? 'cursor-default' : 'cursor-pointer hover:bg-soft',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4.5 w-4.5 flex-none items-center justify-center rounded border',
          checked ? 'border-ok bg-ok text-white' : 'border-line-2 bg-card',
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block break-words', checked && 'text-mut-2 line-through')}>{label}</span>
        {hint && <span className="mt-0.5 block text-[10.5px] text-mut-2">{hint}</span>}
      </span>
    </button>
  )
}

export { Checkbox }
