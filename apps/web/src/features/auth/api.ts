import type { Language, LoginInput, PublicUser, SignupInput } from '@samaj/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguageStore } from '@/i18n';
import { ApiError, api } from '@/lib/api';

export const meKey = ['me'] as const;

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<PublicUser | null> => {
      try {
        return (await api.get<{ user: PublicUser }>('/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    // Refetched on focus after a minute, so a family verified meanwhile sees the directory open up.
    staleTime: 60_000,
  });
}

function useOnSignedIn() {
  const queryClient = useQueryClient();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  return (user: PublicUser) => {
    // Anything cached belonged to the previous (or no) user.
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    queryClient.setQueryData(meKey, user);
    setLanguage(user.language);
  };
}

export function useLogin() {
  const onSignedIn = useOnSignedIn();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<{ user: PublicUser }>('/auth/login', input),
    onSuccess: ({ user }) => onSignedIn(user),
  });
}

export function useSignup() {
  const onSignedIn = useOnSignedIn();
  return useMutation({
    mutationFn: (input: SignupInput) => api.post<{ user: PublicUser }>('/auth/signup', input),
    onSuccess: ({ user }) => onSignedIn(user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    // Sign out locally even if the request failed; the cookies expire anyway.
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(meKey, null);
    },
  });
}

/** Switch language now; save it to the account when signed in. */
export function useChangeLanguage() {
  const queryClient = useQueryClient();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const save = useMutation({
    mutationFn: (language: Language) => api.patch<{ user: PublicUser }>('/auth/me/preferences', { language }),
    onSuccess: ({ user }) => queryClient.setQueryData(meKey, user),
  });

  return {
    change: (language: Language) => {
      setLanguage(language);
      if (queryClient.getQueryData<PublicUser | null>(meKey)) save.mutate(language);
    },
    saving: save.isPending,
    error: save.error,
  };
}
