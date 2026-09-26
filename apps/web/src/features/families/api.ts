import type { FamilyDetail, FamilyUpdateInput, MemberInput, PendingFamilyPage } from '@samaj/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function usePendingFamilies() {
  return useInfiniteQuery({
    queryKey: ['verifications', 'list'],
    queryFn: ({ pageParam, signal }) => api.get<PendingFamilyPage>('/verifications', { cursor: pageParam }, signal),
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
