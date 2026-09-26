import type { AdminUserDetail, AssignCommitteeInput, Branch, BranchCreateInput, BranchSummary, BranchUpdateInput } from '@samaj/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const summaryKey = ['branches', 'summary'] as const;

export function useBranchSummaries() {
  return useQuery({
    queryKey: summaryKey,
    queryFn: async ({ signal }) => (await api.get<{ items: BranchSummary[] }>('/branches/summary', undefined, signal)).items,
  });
}

/** After any change, refresh both the admin summary and the public list the rest of the app uses. */
function useBranchMutation<TVars, TResult>(run: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      // Committee changes also change roles and the Committee page.
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['committee'] });
    },
  });
}

export const useCreateBranch = () => useBranchMutation((input: BranchCreateInput) => api.post<{ branch: Branch }>('/branches', input));

export const useUpdateBranch = () =>
  useBranchMutation(({ id, input }: { id: string; input: BranchUpdateInput }) => api.put<{ branch: Branch }>(`/branches/${id}`, input));

export const useDeleteBranch = () => useBranchMutation((id: string) => api.delete<void>(`/branches/${id}`));

export const useAssignCommittee = () =>
  useBranchMutation(({ branchId, input }: { branchId: string; input: AssignCommitteeInput }) =>
    api.post<{ user: AdminUserDetail }>(`/branches/${branchId}/committee`, input),
  );

export const useRemoveCommittee = () =>
  useBranchMutation(({ branchId, userId }: { branchId: string; userId: string }) => api.delete<{ user: AdminUserDetail }>(`/branches/${branchId}/committee/${userId}`));
