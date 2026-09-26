import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * A placeholder block. Compose these to match the real layout; never use a
 * lone spinner for page content. Radius defaults to xs; pass rounded-full for
 * avatars and rounded-md for cards.
 */
export function Skeleton({ className, ...rest }: ComponentProps<'div'>) {
  return <div aria-hidden="true" className={cn('rounded-xs bg-surface-muted motion-safe:animate-pulse', className)} {...rest} />;
}

/** Lines of text. The last line is shorter, like a real paragraph. */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}
