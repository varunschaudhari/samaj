import type {
  InterestItem,
  MyMatrimony,
  ProfileCard,
  ProfileCreateInput,
  ProfileDetail,
  ProfileFieldsInput,
  ProfilePage,
} from '@samaj/shared';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const keys = {
  mine: ['matrimony', 'mine'] as const,
  profile: (id: string) => ['matrimony', 'profile', id] as const,
  interests: ['matrimony', 'interests'] as const,
  review: ['matrimony', 'review'] as const,
};

export function useMyMatrimony() {
  return useQuery({ queryKey: keys.mine, queryFn: ({ signal }) => api.get<MyMatrimony>('/matrimony/mine', undefined, signal) });
}

export function useProfile(id: string | undefined) {
  return useQuery({
    queryKey: keys.profile(id ?? ''),
    queryFn: async ({ signal }) => (await api.get<{ profile: ProfileDetail }>(`/matrimony/profiles/${id}`, undefined, signal)).profile,
    enabled: Boolean(id),
  });
}

export interface SearchFilters {
  forProfile: string;
  ageMin: string;
  ageMax: string;
  branchId: string;
  education: string;
}

export function useProfileSearch(filters: SearchFilters) {
  return useInfiniteQuery({
    queryKey: ['matrimony', 'search', filters],
    queryFn: ({ pageParam, signal }) =>
      api.get<ProfilePage>('/matrimony/search', { ...filters, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(filters.forProfile),
    placeholderData: keepPreviousData,
  });
}

export function useInterests() {
  return useQuery({
    queryKey: keys.interests,
    queryFn: async ({ signal }) => (await api.get<{ items: InterestItem[] }>('/matrimony/interests', undefined, signal)).items,
  });
}

export function usePendingProfiles(enabled: boolean) {
  return useQuery({
    queryKey: keys.review,
    queryFn: async ({ signal }) => (await api.get<{ items: ProfileCard[] }>('/matrimony/review', undefined, signal)).items,
    enabled,
  });
}

/** After any change, refresh everything matrimonial plus the review badge. */
function useMatrimonyMutation<TVars, TResult>(run: (vars: TVars) => Promise<TResult>, onDone?: (result: TResult) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      onDone?.(result);
      void queryClient.invalidateQueries({ queryKey: ['matrimony'] });
      void queryClient.invalidateQueries({ queryKey: ['verifications'] });
    },
  });
}

export function useCreateProfile() {
  return useMatrimonyMutation(async (input: ProfileCreateInput) => (await api.post<{ profile: ProfileDetail }>('/matrimony/profiles', input)).profile);
}

export function useUpdateProfile(id: string) {
  return useMatrimonyMutation(async (input: ProfileFieldsInput) => (await api.put<{ profile: ProfileDetail }>(`/matrimony/profiles/${id}`, input)).profile);
}

type Action = 'pause' | 'resume' | 'resubmit' | 'approve';
type ReasonAction = 'close' | 'reject' | 'remove';

/** Status changes on a profile. close takes { reason: 'married' | 'withdrawn' }; reject and remove take a note. */
export function useProfileAction(id: string) {
  const queryClient = useQueryClient();
  const store = (profile: ProfileDetail) => queryClient.setQueryData(keys.profile(id), profile);
  const simple = useMatrimonyMutation(
    async (action: Action) => (await api.post<{ profile: ProfileDetail }>(`/matrimony/profiles/${id}/${action}`)).profile,
    store,
  );
  const withReason = useMatrimonyMutation(
    async ({ action, reason }: { action: ReasonAction; reason: string }) =>
      (await api.post<{ profile: ProfileDetail }>(`/matrimony/profiles/${id}/${action}`, { reason })).profile,
    store,
  );
  return { simple, withReason };
}

export function useSendInterest() {
  return useMatrimonyMutation(async (input: { fromProfileId: string; toProfileId: string }) => (await api.post<{ interest: InterestItem }>('/matrimony/interests', input)).interest);
}

export function useInterestAction() {
  return useMatrimonyMutation(async ({ id, action }: { id: string; action: 'accept' | 'decline' | 'withdraw' }) =>
    (await api.post<{ items: InterestItem[] }>(`/matrimony/interests/${id}/${action}`)).items,
  );
}

/** 5′7″ from centimetres, for families who think in feet. */
export function formatHeight(cm: number): string {
  const inches = Math.round(cm / 2.54);
  return `${cm} cm (${Math.floor(inches / 12)}′${inches % 12}″)`;
}
