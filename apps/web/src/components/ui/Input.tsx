import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Field, type FieldProps, controlClasses } from './Field';
import { Icon } from './Icon';

interface InputProps extends Omit<ComponentProps<'input'>, 'id'>, FieldProps {
  leadingIcon?: LucideIcon;
  /** Content at the end of the input, such as a show-password IconButton. */
  trailing?: ReactNode;
  fieldClassName?: string;
}

export function Input({
  label,
  hint,
  error,
  labelSuffix,
  hideLabel,
  id,
  leadingIcon,
  trailing,
  className,
  fieldClassName,
  ...rest
}: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} labelSuffix={labelSuffix} hideLabel={hideLabel} id={id} className={fieldClassName}>
      {(control) => (
        <div className="relative flex items-center">
          {leadingIcon && (
            <Icon icon={leadingIcon} className="pointer-events-none absolute left-3 text-fg-muted" />
          )}
          <input
            {...control}
            {...rest}
            className={cn(controlClasses, 'min-h-touch px-3', leadingIcon && 'pl-10', trailing && 'pr-12', className)}
          />
          {trailing && <div className="absolute right-0">{trailing}</div>}
        </div>
      )}
    </Field>
  );
}
