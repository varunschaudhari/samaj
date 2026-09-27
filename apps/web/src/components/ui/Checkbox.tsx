import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
}

/** A checkbox whose whole label is the touch target, 44px tall at least. */
export function Checkbox({ label, hint, error, className, id, ...rest }: CheckboxProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="flex min-h-touch cursor-pointer items-start gap-3 py-2">
        <input
          type="checkbox"
          id={id}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-xs border-line-strong accent-primary"
          {...rest}
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm text-fg">{label}</span>
          {hint && <span className="text-xs text-fg-muted">{hint}</span>}
        </span>
      </label>
      {error && (
        <p role="alert" className="pl-8 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
