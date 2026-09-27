import type { DeclineInput, FamilyRequests, LinkRequestInput, MemberMoveView, MoveRequestInput, PendingMember, RejectMemberInput } from '@samaj/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const requestsKey = (familyId: string) => ['familyRequests', familyId] as const;

/** Links and moves waiting for a family. Only the family and its committee may ask. */
export function useFamilyRequests(familyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: requestsKey(familyId ?? ''),
    queryFn: async ({ signal }) => (await api.get<{ requests: FamilyRequests }>(`/families/${familyId}/requests`, undefined, signal)).requests,
    enabled: Boolean(familyId) && enabled,
    staleTime: 30_000,
  });
}

/** Any change here can touch both families, the review queue, the directory and the dashboard. */
function useLinkMutation<TVars, TResult>(run: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      for (const key of ['family', 'familyRequests', 'verifications', 'moves', 'memberApprovals', 'members', 'dashboard']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export const useRequestLink = () => useLinkMutation((input: LinkRequestInput) => api.post<{ requests: FamilyRequests }>('/links', input));
export const useAcceptLink = () => useLinkMutation((id: string) => api.post<{ requests: FamilyRequests }>(`/links/${id}/accept`));
export const useRemoveLink = () => useLinkMutation((id: string) => api.delete<void>(`/links/${id}`));

/** The parent's family answers "your Anil is our Rohit's father". */
export const useAcceptParentLink = () => useLinkMutation((memberId: string) => api.post<{ requests: FamilyRequests }>(`/links/parents/${memberId}/accept`));
export const useDeclineParentLink = () => useLinkMutation((memberId: string) => api.post<{ requests: FamilyRequests }>(`/links/parents/${memberId}/decline`));

export const useRequestMove = () => useLinkMutation((input: MoveRequestInput) => api.post<{ move: MemberMoveView }>('/moves', input));
export const useAgreeMove = () => useLinkMutation((id: string) => api.post<{ move: MemberMoveView }>(`/moves/${id}/agree`));
export const useApproveMove = () => useLinkMutation((id: string) => api.post<{ move: MemberMoveView }>(`/moves/${id}/approve`));
export const useDeclineMove = () =>
  useLinkMutation(({ id, input }: { id: string; input: DeclineInput }) => api.post<{ move: MemberMoveView }>(`/moves/${id}/decline`, input));
export const useCancelMove = () => useLinkMutation((id: string) => api.delete<void>(`/moves/${id}`));

/** The committee's queues. */
export function usePendingMoves(enabled: boolean) {
  return useQuery({
    queryKey: ['moves', 'pending'],
    queryFn: async ({ signal }) => (await api.get<{ items: MemberMoveView[] }>('/moves/pending', undefined, signal)).items,
    enabled,
  });
}

export function usePendingMembers(enabled: boolean) {
  return useQuery({
    queryKey: ['memberApprovals'],
    queryFn: async ({ signal }) => (await api.get<{ items: PendingMember[] }>('/member-approvals', undefined, signal)).items,
    enabled,
  });
}

export const useApproveMember = () => useLinkMutation((id: string) => api.post<void>(`/member-approvals/${id}/approve`));
export const useRejectMember = () =>
  useLinkMutation(({ id, input }: { id: string; input: RejectMemberInput }) => api.post<void>(`/member-approvals/${id}/reject`, input));
