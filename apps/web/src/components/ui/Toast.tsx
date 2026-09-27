import { CircleAlert, CircleCheck, Info, type AppIcon, TriangleAlert, X } from '@/components/ui/icons';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

type Tone = 'success' | 'info' | 'warning' | 'danger';

interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  description?: string | undefined;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => set((s) => ({ toasts: [...s.toasts.slice(-2), { ...toast, id: nextId++ }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Call from anywhere, including outside React. */
export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ tone: 'success', title, description }),
  info: (title: string, description?: string) => useToastStore.getState().push({ tone: 'info', title, description }),
  warning: (title: string, description?: string) => useToastStore.getState().push({ tone: 'warning', title, description }),
  error: (title: string, description?: string) => useToastStore.getState().push({ tone: 'danger', title, description }),
};

const TONE: Record<Tone, { icon: AppIcon; className: string }> = {
  success: { icon: CircleCheck, className: 'text-success' },
  info: { icon: Info, className: 'text-info' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
  danger: { icon: CircleAlert, className: 'text-danger' },
};

// Errors stay until dismissed; they usually need reading.
const AUTO_DISMISS_MS: Record<Tone, number | null> = { success: 5000, info: 5000, warning: 8000, danger: null };

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const t = useT();
  const tone = TONE[item.tone];

  useEffect(() => {
    const ms = AUTO_DISMISS_MS[item.tone];
    if (ms === null) return;
    const timer = window.setTimeout(() => dismiss(item.id), ms);
    return () => window.clearTimeout(timer);
  }, [item, dismiss]);

  return (
    <li
      role={item.tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-md border border-line bg-surface py-2 pr-1 pl-4 shadow-overlay',
        'transition-[opacity,translate] duration-200 ease-out starting:translate-y-2 starting:opacity-0',
      )}
    >
      <Icon icon={tone.icon} className={cn('mt-3', tone.className)} />
      <div className="flex-1 py-2">
        <p className="text-sm font-semibold text-fg">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm text-fg-muted">{item.description}</p>}
      </div>
      <IconButton icon={X} label={t('common.close')} onClick={() => dismiss(item.id)} />
    </li>
  );
}

/** Mount once. Sits above the mobile bottom navigation. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <ol
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md flex-col gap-2 px-4 md:right-4 md:bottom-4 md:left-auto md:mx-0 md:w-96 md:px-0"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </ol>
  );
}
