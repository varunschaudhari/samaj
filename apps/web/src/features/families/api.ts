import type { EnrolFamilyInput, FamilyDetail, FamilyUpdateInput, InviteCode, MemberInput, PendingFamilyPage, ReviewSort } from '@samaj/shared';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meKey } from '@/features/auth/api';
import { api } from '@/lib/api';
import { resizeImage } from '@/lib/image';

export const familyKey = (id: string) => ['family', id] as const;

export function useFamily(id: string | undefined) {
  return useQuery({
    queryKey: familyKey(id ?? ''),
    queryFn: async ({ signal }) => (await api.get<{ family: FamilyDetail }>(`/families/${id}`, undefined, signal)).family,
    enabled: Boolean(id),
  });
}

/**
 * Every family mutation returns the updated family. Put it in the cache and
 * refresh whatever lists might show it.
 */
function useFamilyMutation<TVars>(familyId: string, run: (vars: TVars) => Promise<{ family: FamilyDetail }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: ({ family }) => {
      queryClient.setQueryData(familyKey(familyId), family);
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void queryClient.invalidateQueries({ queryKey: ['verifications'] });
    },
  });
}

export function useUpdateFamily(familyId: string) {
  return useFamilyMutation(familyId, (input: FamilyUpdateInput) => api.put(`/families/${familyId}`, input));
}

export function useSaveMember(familyId: string) {
  return useFamilyMutation(familyId, ({ memberId, input }: { memberId: string | null; input: MemberInput }) =>
    memberId ? api.put(`/families/${familyId}/members/${memberId}`, input) : api.post(`/families/${familyId}/members`, input),
  );
}

export function useRemoveMember(familyId: string) {
  return useFamilyMutation(familyId, (memberId: string) => api.delete(`/families/${familyId}/members/${memberId}`));
}

/** A one-time code so a listed person can sign in to this family. The family's history records it, so refresh the page. */
export function useCreateInvite(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => (await api.post<{ invite: InviteCode }>(`/families/${familyId}/members/${memberId}/invite`)).invite,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: familyKey(familyId) }),
  });
}

/** A committee member or admin registers a family on its behalf. */
export function useEnrolFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: EnrolFamilyInput) => (await api.post<{ family: FamilyDetail }>('/families', input)).family,
    onSuccess: (family) => {
      queryClient.setQueryData(familyKey(family.id), family);
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

export function useUploadPhoto(familyId: string) {
  return useFamilyMutation(familyId, async ({ memberId, file }: { memberId: string; file: File }) =>
    api.upload(`/families/${familyId}/members/${memberId}/photo`, await resizeImage(file)),
  );
}

export function useRemovePhoto(familyId: string) {
  return useFamilyMutation(familyId, (memberId: string) => api.delete(`/families/${familyId}/members/${memberId}/photo`));
}

export function useReview(familyId: string) {
  const queryClient = useQueryClient();
  const refreshMe = () => void queryClient.invalidateQueries({ queryKey: meKey });
  const verify = useFamilyMutation(familyId, () => api.post(`/families/${familyId}/verify`));
  const reject = useFamilyMutation(familyId, (reason: string) => api.post(`/families/${familyId}/reject`, { reason }));
  const resubmit = useFamilyMutation(familyId, async () => {
    const result = await api.post<{ family: FamilyDetail }>(`/families/${familyId}/resubmit`);
    refreshMe();
    return result;
  });
  return { verify, reject, resubmit };
}

export interface ReviewFilters {
  branchId: string;
  sort: ReviewSort;
}

export function usePendingFamilies(filters: ReviewFilters = { branchId: '', sort: 'oldest' }) {
  return useInfiniteQuery({
    queryKey: ['verifications', 'list', filters],
    queryFn: ({ pageParam, signal }) => api.get<PendingFamilyPage>('/verifications', { ...filters, cursor: pageParam }, signal),
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Badge count for the Review tab. Polls gently so new signups show up. */
export function usePendingCount(enabled: boolean) {
  return useQuery({
    queryKey: ['verifications', 'count'],
    queryFn: async () => (await api.get<{ pending: number }>('/verifications/count')).pending,
    enabled,
    refetchInterval: 5 * 60_000,
  });
}
