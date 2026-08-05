import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      {/* Above the mobile tab bar (z-120), its sheet (z-140) and the
          notifications panel (z-150) — otherwise the fixed nav covers the
          dialog's footer buttons on a phone. */}
      <DialogPrimitive.Overlay className="fixed inset-0 z-200 bg-ink/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          // Border carries the edge in dark mode, where the drop shadow all but
          // disappears against the page.
          'fixed left-1/2 top-1/2 z-200 flex max-h-[92dvh] w-[calc(100%-20px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-line bg-card shadow-[0_30px_80px_rgba(10,14,18,0.4)] focus:outline-none data-[state=open]:animate-rise',
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute right-5 top-3.75 z-3 grid h-7.5 w-7.5 cursor-pointer place-items-center rounded-lg bg-soft-2 text-mut-3 hover:bg-line hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('sticky top-0 z-2 border-b border-line-soft bg-card px-5 py-3.75', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-base font-extrabold', className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-xs text-mut', className)} {...props} />
}

function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 py-4.5', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'sticky bottom-0 flex flex-wrap items-center justify-end gap-2.5 border-t border-line-soft bg-card px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
        className,
      )}
      {...props}
    />
  )
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter }
