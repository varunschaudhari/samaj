import { RotateCw, TriangleAlert } from '@/components/ui/icons';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button, EmptyState } from '@/components/ui';
import { useT } from '@/i18n';

function CrashScreen() {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <EmptyState
        tone="danger"
        icon={TriangleAlert}
        title={t('crash.title')}
        body={t('crash.body')}
        className="w-full"
        action={
          <Button leadingIcon={RotateCw} onClick={() => window.location.reload()}>
            {t('crash.reload')}
          </Button>
        }
      />
    </main>
  );
}

/** Last line of defence: anything that throws while rendering lands here instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Replace with an error reporting service when there is one.
    console.error('Render error', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}

/** Route-level errorElement: the same screen for errors thrown inside a route. */
export function RouteErrorScreen() {
  const error = useRouteError();
  if (!isRouteErrorResponse(error)) console.error('Route error', error);
  return <CrashScreen />;
}
