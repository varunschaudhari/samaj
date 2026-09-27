import { useEffect, useRef } from 'react';
import { useErrorMessage, useT } from '@/i18n';
import { Button } from './Button';
import { RotateCw } from './icons';

interface LoadMoreProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  error: unknown;
  fetchNextPage: () => unknown;
  /** Button text, e.g. "Show more members". */
  label: string;
  /** Shown once everything has loaded. */
  endLabel?: string;
}

/**
 * The end of a paged list. The next page loads by itself as the end scrolls
 * into view; the button is there for keyboards, screen readers and browsers
 * without IntersectionObserver. A failed page shows its error with a retry.
 */
export function LoadMore({ hasNextPage, isFetchingNextPage, isFetchNextPageError, error, fetchNextPage, label, endLabel }: LoadMoreProps) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const sentinel = useRef<HTMLDivElement>(null);
  const auto = hasNextPage && !isFetchingNextPage && !isFetchNextPageError;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !auto || typeof IntersectionObserver === 'undefined') return;
    // Start a screen early, so the next page is usually there before it's needed.
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && fetchNextPage(), { rootMargin: '600px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [auto, fetchNextPage]);

  if (isFetchNextPageError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-center gap-3 text-sm text-danger">
        {errorMessage(error)}
        <Button variant="secondary" size="sm" leadingIcon={RotateCw} onClick={() => fetchNextPage()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }
  if (!hasNextPage) return endLabel ? <p className="text-center text-sm text-fg-muted">{endLabel}</p> : null;
  return (
    <div ref={sentinel} className="flex justify-center">
      <Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
        {label}
      </Button>
    </div>
  );
}
