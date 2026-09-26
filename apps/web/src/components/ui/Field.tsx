import { CircleAlert } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface FieldProps {
  label: string;
  hint?: ReactNode | undefined;
  error?: string | undefined;
  /** Text shown after the label, e.g. "optional". */
  labelSuffix?: string | undefined;
  hideLabel?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
}

export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

/**
 * Label, hint and error around a form control, with ids wired so screen
 * readers announce the hint and error with the control.
 */
export function Field({
  label,
  hint,
  error,
  labelSuffix,
  hideLabel,
  id: idProp,
  className,
  children,
}: FieldProps & { children: (control: FieldControlProps) => ReactNode }) {
  const generated = useId();
  const id = idProp ?? generated;
  const showHint = Boolean(hint) && !error;
  const hintId = showHint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-sm font-semibold text-fg', hideLabel && 'sr-only')}>
        {label}
        {labelSuffix && <span className="ml-1 font-normal text-fg-muted">({labelSuffix})</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger">
          <Icon icon={CircleAlert} size="sm" className="mt-0.5" />
          {error}
        </p>
      )}
      {showHint && (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Shared look for text-like controls, so Input, Select and Textarea match. */
export const controlClasses = cn(
  'w-full rounded-sm border border-line-strong bg-surface text-base text-fg',
  'placeholder:text-fg-muted',
  'transition-colors duration-150 hover:border-fg-muted',
  'focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary',
  'aria-invalid:border-danger aria-invalid:focus-visible:outline-danger',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-muted',
);
