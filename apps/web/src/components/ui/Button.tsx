import { type VariantProps, cva } from 'class-variance-authority';
import { LoaderCircle, type AppIcon } from '@/components/ui/icons';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-sm font-sans font-semibold whitespace-nowrap select-none',
    'min-h-touch border transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress',
  ],
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-primary text-on-primary hover:bg-primary-hover',
        secondary: 'border-line-strong bg-surface text-primary hover:bg-primary-soft',
        ghost: 'border-transparent bg-transparent text-fg hover:bg-surface-muted',
        danger: 'border-transparent bg-danger text-on-danger hover:bg-danger-hover',
      },
      // Every size keeps the 44px minimum touch target; they differ in padding and type.
      size: {
        sm: 'px-3 text-sm',
        md: 'px-4 text-base',
        lg: 'min-h-12 px-5 text-lg',
      },
      fullWidth: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  leadingIcon?: AppIcon;
  trailingIcon?: AppIcon;
  /** Shows a spinner, keeps the label (so the width doesn't jump) and blocks clicks. */
  loading?: boolean;
}

export function Button({
  variant,
  size,
  fullWidth,
  leadingIcon,
  trailingIcon,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon icon={LoaderCircle} className="motion-safe:animate-spin" />
      ) : (
        leadingIcon && <Icon icon={leadingIcon} />
      )}
      {children}
      {trailingIcon && !loading && <Icon icon={trailingIcon} />}
    </button>
  );
}
