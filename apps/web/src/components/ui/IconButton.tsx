import { type VariantProps, cva } from 'class-variance-authority';
import type { AppIcon } from '@/components/ui/icons';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

const iconButtonVariants = cva(
  'inline-flex size-touch shrink-0 items-center justify-center rounded-sm border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        ghost: 'border-transparent text-fg-muted hover:bg-surface-muted hover:text-fg',
        secondary: 'border-line-strong bg-surface text-primary hover:bg-primary-soft',
        primary: 'border-transparent bg-primary text-on-primary hover:bg-primary-hover',
      },
    },
    defaultVariants: { variant: 'ghost' },
  },
);

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'>, VariantProps<typeof iconButtonVariants> {
  icon: AppIcon;
  /** Required: it is both the accessible name and the tooltip text. */
  label: string;
  tooltipSide?: 'top' | 'bottom';
}

/** A button whose only content is an icon. Always labelled, always has a tooltip. */
export function IconButton({ icon, label, variant, tooltipSide, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <button type={type} aria-label={label} className={cn(iconButtonVariants({ variant }), className)} {...rest}>
        <Icon icon={icon} />
      </button>
    </Tooltip>
  );
}
