import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry only what might succeed next time: network drops and 5xx.
      retry: (failureCount, error) =>
        failureCount < 2 && error instanceof ApiError && (error.code === 'NETWORK' || error.status >= 500),
    },
    mutations: { retry: false },
  },
});
