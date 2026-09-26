import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

interface ChipProps extends Omit<ComponentProps<'button'>, 'children'> {
  selected: boolean;
  icon?: LucideIcon;
  children: ReactNode;
}

/** A toggle in a row of filters. 44px tall, like every other touch target. */
export function Chip({ selected, icon, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150',
        selected ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface text-fg-muted hover:text-fg',
        className,
      )}
      {...rest}
    >
      {icon && <Icon icon={icon} size="sm" />}
      {children}
    </button>
  );
}

/**
 * A row of chips. On phones it scrolls sideways instead of wrapping, and runs
 * to the screen edge so it's clear there is more.
 */
export function ChipRow({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0', className)}>
      {children}
    </div>
  );
}
