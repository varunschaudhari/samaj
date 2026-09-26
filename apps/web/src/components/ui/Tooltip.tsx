import { type ReactElement, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom';
  children: ReactElement;
}

const EDGE_GAP = 8;

/**
 * Shows a short label on hover and keyboard focus, and hides on Escape
 * (WCAG 1.4.13). The trigger must carry its own accessible name, so the
 * tooltip is aria-hidden to avoid it being read twice.
 *
 * Rendered only while open, and nudged to stay on screen: a hidden tooltip
 * next to a right-edge button would otherwise widen the page on phones.
 */
export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const tipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !tipRef.current) return;
    const rect = tipRef.current.getBoundingClientRect();
    const overRight = rect.right - (document.documentElement.clientWidth - EDGE_GAP);
    const overLeft = EDGE_GAP - rect.left;
    setShift(overRight > 0 ? -overRight : overLeft > 0 ? overLeft : 0);
  }, [open]);

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={() => {
        setOpen(false);
        setShift(0);
      }}
      onFocus={(e) => e.target.matches(':focus-visible') && setOpen(true)}
      onBlur={() => {
        setOpen(false);
        setShift(0);
      }}
    >
      {children}
      {open && (
        <span
          ref={tipRef}
          aria-hidden="true"
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className={cn(
            'pointer-events-none absolute left-1/2 z-50 rounded-xs bg-fg px-2 py-1 text-xs font-medium whitespace-nowrap text-canvas shadow-raised',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
