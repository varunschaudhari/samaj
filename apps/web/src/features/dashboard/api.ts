import type { Dashboard } from '@samaj/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** The committee or admin dashboard. The server caches it for a minute, so refreshing more often gains nothing. */
export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async ({ signal }) => (await api.get<{ dashboard: Dashboard }>('/dashboard', undefined, signal)).dashboard,
    staleTime: 60_000,
    enabled,
  });
}
