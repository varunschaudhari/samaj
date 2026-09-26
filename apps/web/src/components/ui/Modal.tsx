import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Action buttons. Put the primary action last. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Built on the native <dialog>, which traps focus, restores it on close and
 * handles Escape. A bottom sheet on phones, a centred dialog from sm up.
 */
export function Modal({ open, onClose, title, description, children, footer, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const t = useT();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> element itself.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        'm-0 mt-auto max-h-[calc(100dvh-2rem)] w-full max-w-none bg-surface text-fg shadow-overlay backdrop:bg-scrim',
        'rounded-t-lg sm:m-auto sm:max-w-lg sm:rounded-lg',
        'transition-[opacity,translate] duration-200 ease-out starting:translate-y-4 starting:opacity-0',
        className,
      )}
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start gap-3 border-b border-line py-3 pr-2 pl-5">
          <div className="flex-1 pt-2">
            <h2 id={titleId} className="font-display text-xl font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton icon={X} label={t('common.close')} onClick={onClose} tooltipSide="bottom" />
        </header>
        {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
