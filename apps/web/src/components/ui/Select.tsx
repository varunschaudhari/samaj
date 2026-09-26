import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Field, type FieldProps, controlClasses } from './Field';
import { Icon } from './Icon';

interface SelectProps extends Omit<ComponentProps<'select'>, 'id'>, FieldProps {
  /** Shown as a disabled first option until something is chosen. */
  placeholder?: string;
  fieldClassName?: string;
}

/** A styled native <select>: the phone's own picker is the best UI on Android. */
export function Select({
  label,
  hint,
  error,
  labelSuffix,
  hideLabel,
  id,
  placeholder,
  className,
  fieldClassName,
  children,
  ...rest
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} labelSuffix={labelSuffix} hideLabel={hideLabel} id={id} className={fieldClassName}>
      {(control) => (
        <div className="relative flex items-center">
          <select {...control} {...rest} className={cn(controlClasses, 'min-h-touch appearance-none pr-10 pl-3', className)}>
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {children}
          </select>
          <Icon icon={ChevronDown} className="pointer-events-none absolute right-3 text-fg-muted" />
        </div>
      )}
    </Field>
  );
}
