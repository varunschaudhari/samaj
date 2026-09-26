import { type ReactElement, type ReactNode, useEffect, useId, useState } from 'react';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom';
  children: ReactElement;
}

/**
 * Shows a short label on hover and keyboard focus, and hides on Escape
 * (WCAG 1.4.13). The trigger must carry its own accessible name, so the
 * tooltip is aria-hidden to avoid it being read twice.
 */
export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={(e) => e.target.matches(':focus-visible') && setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        id={id}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-xs bg-fg px-2 py-1 text-xs font-medium whitespace-nowrap text-canvas shadow-raised',
          'transition-opacity duration-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          open ? 'opacity-100' : 'opacity-0',
        )}
      >
        {content}
      </span>
    </span>
  );
}
