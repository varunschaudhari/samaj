import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentProps, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const cardVariants = cva('rounded-md bg-surface text-fg', {
  variants: {
    variant: {
      outlined: 'border border-line',
      raised: 'border border-line shadow-raised',
      muted: 'bg-surface-muted',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: { variant: 'outlined', padding: 'md' },
});

// HTMLElement (not div) so the props fit whichever tag `as` picks.
interface CardProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof cardVariants> {
  as?: 'div' | 'section' | 'article' | 'li';
}

export function Card({ as: Tag = 'div', variant, padding, className, ...rest }: CardProps) {
  return <Tag className={cn(cardVariants({ variant, padding }), className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: ComponentProps<'h2'>) {
  return <h2 className={cn('font-display text-lg font-semibold text-fg', className)} {...rest} />;
}
