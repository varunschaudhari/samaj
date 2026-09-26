import type { Branch, BranchCreateInput, BranchSummary, BranchUpdateInput } from '@samaj/shared';
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
    },
  });
}

export const useCreateBranch = () => useBranchMutation((input: BranchCreateInput) => api.post<{ branch: Branch }>('/branches', input));

export const useUpdateBranch = () =>
  useBranchMutation(({ id, input }: { id: string; input: BranchUpdateInput }) => api.put<{ branch: Branch }>(`/branches/${id}`, input));

export const useDeleteBranch = () => useBranchMutation((id: string) => api.delete<void>(`/branches/${id}`));
