import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Field, type FieldProps, controlClasses } from './Field';

interface TextareaProps extends Omit<ComponentProps<'textarea'>, 'id'>, FieldProps {
  fieldClassName?: string;
}

export function Textarea({ label, hint, error, labelSuffix, hideLabel, id, rows = 4, className, fieldClassName, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} labelSuffix={labelSuffix} hideLabel={hideLabel} id={id} className={fieldClassName}>
      {(control) => (
        <textarea {...control} {...rest} rows={rows} className={cn(controlClasses, 'min-h-touch resize-y px-3 py-2.5', className)} />
      )}
    </Field>
  );
}
