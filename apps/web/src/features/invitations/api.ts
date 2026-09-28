import type { BranchShareRequest, BranchShareView, CreateInvitationInput, InvitationAudience, InvitationDetail, InvitationInput, InvitationRsvpInput, LinkReplyInput, LinkReplyReceipt, MyInvitations, PublicInvitation } from '@samaj/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const invitationsKey = ['invitations'] as const;

/** Invitations to the viewer's family and from it. */
export function useMyInvitations(enabled = true) {
  return useQuery({
    queryKey: invitationsKey,
    queryFn: async ({ signal }) => api.get<MyInvitations>('/invitations', undefined, signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useInvitation(id: string | undefined) {
  return useQuery({
    queryKey: [...invitationsKey, id],
    queryFn: async ({ signal }) => (await api.get<{ invitation: InvitationDetail }>(`/invitations/${id}`, undefined, signal)).invitation,
    enabled: Boolean(id),
  });
}

/** Families the host can pick from: their family tree and linked families. */
export function useAudience(enabled: boolean) {
  return useQuery({
    queryKey: [...invitationsKey, 'audience'],
    queryFn: async ({ signal }) => (await api.get<{ audience: InvitationAudience }>('/invitations/audience', undefined, signal)).audience,
    enabled,
  });
}

/** Every change here shows in both the list and the invitation. */
function useInvitationMutation<TVars>(run: (vars: TVars) => Promise<InvitationDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (invitation) => {
      queryClient.setQueryData([...invitationsKey, invitation.id], invitation);
      void queryClient.invalidateQueries({ queryKey: invitationsKey, exact: true });
    },
  });
}

type GuestPicks = { guestFamilyIds: string[]; treeFamilyIds: string[]; linkedFamilyIds: string[] };

export const useCreateInvitation = () =>
  useInvitationMutation(async (input: CreateInvitationInput) => (await api.post<{ invitation: InvitationDetail }>('/invitations', input)).invitation);
export const useUpdateInvitation = (id: string) =>
  useInvitationMutation(async (input: InvitationInput) => (await api.put<{ invitation: InvitationDetail }>(`/invitations/${id}`, input)).invitation);
export const useAddGuests = (id: string) =>
  useInvitationMutation(async (input: GuestPicks) => (await api.post<{ invitation: InvitationDetail }>(`/invitations/${id}/guests`, input)).invitation);
export const useCancelInvitation = (id: string) =>
  useInvitationMutation(async () => (await api.post<{ invitation: InvitationDetail }>(`/invitations/${id}/cancel`)).invitation);
export const useAnswerInvitation = (id: string) =>
  useInvitationMutation(async (input: InvitationRsvpInput) => (await api.put<{ invitation: InvitationDetail }>(`/invitations/${id}/rsvp`, input)).invitation);

/** Stop seeing a family's invitations, or see them again. */
export function useHideFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, hidden }: { familyId: string; hidden: boolean }) =>
      hidden ? api.put<void>(`/invitations/hidden/${familyId}`) : api.delete<void>(`/invitations/hidden/${familyId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: invitationsKey, exact: true }),
  });
}

/** The link for people not on the app: on gives a link (a new one if it was off), off stops it. */
export const useShareLink = (id: string) =>
  useInvitationMutation(async (on: boolean) => (on ? await api.put<{ invitation: InvitationDetail }>(`/invitations/${id}/link`) : await api.delete<{ invitation: InvitationDetail }>(`/invitations/${id}/link`)).invitation);
export const useRemoveLinkReply = (id: string) =>
  useInvitationMutation(async (replyId: string) => (await api.delete<{ invitation: InvitationDetail }>(`/invitations/${id}/link-replies/${replyId}`)).invitation);

/** The card behind a link, for anyone who has it. */
export function usePublicInvitation(token: string) {
  return useQuery({
    queryKey: ['public-invitation', token],
    queryFn: async ({ signal }) => (await api.get<{ invitation: PublicInvitation }>(`/public/invitations/${token}`, undefined, signal)).invitation,
    retry: false,
  });
}

export const useLinkReply = (token: string) =>
  useMutation({ mutationFn: async (input: LinkReplyInput) => (await api.post<{ reply: LinkReplyReceipt }>(`/public/invitations/${token}/reply`, input)).reply });

/** The link to send: the page anyone can open, in the language it was shared in. */
export const publicLink = (token: string, language: string) => `${window.location.origin}/i/${token}${language === 'mr' ? '?lang=mr' : ''}`;

/** The family's printed patrika: a photo of it or its PDF. */
export const useSetPatrika = (id: string) =>
  useInvitationMutation(async (file: File) => (await api.upload<{ invitation: InvitationDetail }>(`/invitations/${id}/patrika`, file)).invitation);
export const useRemovePatrika = (id: string) => useInvitationMutation(async () => (await api.delete<{ invitation: InvitationDetail }>(`/invitations/${id}/patrika`)).invitation);

/** The host asks the branch committee to share it with the whole branch, or takes the request back. */
export const useRequestBranchShare = (id: string) =>
  useInvitationMutation(async (ask: boolean) =>
    (ask ? await api.put<{ invitation: InvitationDetail }>(`/invitations/${id}/branch-share`) : await api.delete<{ invitation: InvitationDetail }>(`/invitations/${id}/branch-share`)).invitation,
  );

const branchRequestsKey = [...invitationsKey, 'branch-requests'] as const;

/** For the committee: families asking to share an invitation with their branch. */
export function useBranchRequests(enabled: boolean) {
  return useQuery({
    queryKey: branchRequestsKey,
    queryFn: async ({ signal }) => (await api.get<{ requests: BranchShareRequest[] }>('/invitations/branch-requests', undefined, signal)).requests,
    enabled,
    staleTime: 60_000,
  });
}

/** Approve (posting the notice, in words the committee checked) or decline with a reason. */
export function useDecideBranchShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (d: { id: string; approve: { title: string; body: string } } | { id: string; decline: { reason: string } }) =>
      (
        'approve' in d
          ? await api.post<{ branchShare: BranchShareView }>(`/invitations/${d.id}/branch-share/approve`, d.approve)
          : await api.post<{ branchShare: BranchShareView }>(`/invitations/${d.id}/branch-share/decline`, d.decline)
      ).branchShare,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: branchRequestsKey });
      void queryClient.invalidateQueries({ queryKey: ['notices'] });
    },
  });
}
