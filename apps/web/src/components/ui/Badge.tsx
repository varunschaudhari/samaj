import { type VariantProps, cva } from 'class-variance-authority';
import type { AppIcon } from '@/components/ui/icons';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-xs font-semibold whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-surface-muted text-fg-muted',
      primary: 'bg-primary-soft text-primary',
      zari: 'bg-zari-soft text-zari-fg',
      kumkum: 'bg-kumkum-soft text-kumkum',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      info: 'bg-info-soft text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  icon?: AppIcon;
}

export function Badge({ tone, icon, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...rest}>
      {icon && <Icon icon={icon} size="sm" />}
      {children}
    </span>
  );
}
