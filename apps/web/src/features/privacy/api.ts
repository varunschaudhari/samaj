import type { DeletionRequestInput, MemberPrivacyInput, PrivacyInfo, PrivacyStatus } from '@samaj/shared';
import { PRIVACY_NOTICE_VERSION } from '@samaj/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meKey } from '@/features/auth/api';
import { api } from '@/lib/api';

export function usePrivacyInfo() {
  return useQuery({
    queryKey: ['privacy', 'info'],
    queryFn: async ({ signal }) => (await api.get<{ info: PrivacyInfo }>('/privacy/info', undefined, signal)).info,
    staleTime: 60 * 60_000,
  });
}

export function usePrivacyStatus() {
  return useQuery({
    queryKey: ['privacy', 'status'],
    queryFn: async ({ signal }) => (await api.get<{ status: PrivacyStatus }>('/privacy/status', undefined, signal)).status,
  });
}

/** Consent and deletion change what /auth/me says, so refresh it too. */
function usePrivacyMutation<TVars>(run: (vars: TVars) => Promise<{ status: PrivacyStatus }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: ({ status }) => {
      queryClient.setQueryData(['privacy', 'status'], status);
      void queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}

export const useConsent = () => usePrivacyMutation(() => api.post<{ status: PrivacyStatus }>('/privacy/consent', { version: PRIVACY_NOTICE_VERSION, accept: true }));
export const useRequestDeletion = () => usePrivacyMutation((input: DeletionRequestInput) => api.post<{ status: PrivacyStatus }>('/privacy/deletion', input));
export const useCancelDeletion = () => usePrivacyMutation(() => api.delete<{ status: PrivacyStatus }>('/privacy/deletion'));

export function useSetMemberPrivacy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, input }: { memberId: string; input: MemberPrivacyInput }) => api.put<void>(`/privacy/members/${memberId}`, input),
    onSuccess: () => {
      for (const key of ['family', 'members', 'privacy']) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}

/** Fetches the export and hands it to the browser as a file. */
export async function downloadMyData(): Promise<void> {
  const res = await fetch('/api/privacy/export', { credentials: 'include' });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `samaj-my-data-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
