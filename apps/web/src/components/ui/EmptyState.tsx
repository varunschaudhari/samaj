import { CircleAlert, type LucideIcon, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useErrorMessage, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Icon } from './Icon';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Say what to do next, not just that there's nothing here. */
  body: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
  className?: string;
}

export function EmptyState({ icon, title, body, action, tone = 'neutral', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-md border border-dashed border-line px-6 py-10 text-center', className)}>
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary',
        )}
      >
        <Icon icon={icon} size="lg" />
      </span>
      <h2 className="font-display text-lg font-semibold text-fg">{title}</h2>
      <div className="max-w-prose text-sm text-fg-muted">{body}</div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}

/** The error state for a list or page: what happened, how to recover, and a reference to quote. */
export function ErrorState({ title, error, onRetry, retrying, className }: ErrorStateProps) {
  const t = useT();
  const message = useErrorMessage();
  const reference = error instanceof ApiError ? error.requestId : undefined;
  return (
    <EmptyState
      tone="danger"
      icon={CircleAlert}
      title={title}
      className={className}
      body={
        <>
          <p>{message(error)}</p>
          {reference && <p className="mt-2 text-xs">{t('common.reference', { id: reference })}</p>}
        </>
      }
      action={
        <Button variant="secondary" leadingIcon={RotateCw} onClick={onRetry} loading={retrying}>
          {t('common.retry')}
        </Button>
      }
    />
  );
}
