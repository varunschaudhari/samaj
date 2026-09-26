import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ErrorState } from '@/components/ui';
import { ShellSkeleton } from '@/components/layout/ShellSkeleton';
import { useT } from '@/i18n';
import { useMe } from './api';

/** Renders children only for a signed-in user; otherwise sends them to sign in and back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  const t = useT();

  if (me.isPending) return <ShellSkeleton />;
  if (me.isError) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <ErrorState title={t('error.INTERNAL')} error={me.error} onRetry={() => me.refetch()} retrying={me.isFetching} />
      </main>
    );
  }
  if (!me.data) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return children;
}

/** For sign-in and sign-up: a signed-in user goes straight to the app. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.data) return <Navigate to="/home" replace />;
  return children;
}
