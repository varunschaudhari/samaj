import type { GotraList, MemberPage } from '@samaj/shared';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DirectoryFilters {
  q: string;
  branchId: string;
  gotra: string;
}

export function useMembers(filters: DirectoryFilters) {
  return useInfiniteQuery({
    queryKey: ['members', filters],
    queryFn: ({ pageParam, signal }) =>
      api.get<MemberPage>('/members', { q: filters.q, branchId: filters.branchId, gotra: filters.gotra, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Keep showing the previous results while a new search loads, instead of flashing skeletons.
    placeholderData: keepPreviousData,
  });
}

export function useGotras() {
  return useQuery({
    queryKey: ['gotras'],
    queryFn: async () => (await api.get<GotraList>('/members/gotras')).items,
    staleTime: 10 * 60_000,
  });
}
