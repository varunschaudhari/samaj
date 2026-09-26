import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Toaster } from '@/components/ui';
import { meKey } from '@/features/auth/api';
import { setSessionExpiredHandler } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { router } from './router';
import './styles/index.css';

// When a refresh fails mid-session, drop the user; RequireAuth then redirects to sign in.
setSessionExpiredHandler(() => queryClient.setQueryData(meKey, null));

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
