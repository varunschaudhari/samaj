import type { AdminUserDetail, AdminUserPage, ChangePasswordInput, ResetCode, ResetPasswordInput, Role, RoleUpdateInput } from '@samaj/shared';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface UserFilters {
  q: string;
  role: Role | '';
}

export function useUsers(filters: UserFilters) {
  return useInfiniteQuery({
    queryKey: ['users', 'list', filters],
    queryFn: ({ pageParam, signal }) => api.get<AdminUserPage>('/users', { q: filters.q, role: filters.role, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useUser(id: string | null) {
  return useQuery({
    queryKey: ['users', 'detail', id],
    queryFn: async ({ signal }) => (await api.get<{ user: AdminUserDetail }>(`/users/${id}`, undefined, signal)).user,
    enabled: Boolean(id),
  });
}

export function useUpdateRole(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RoleUpdateInput) => api.put<{ user: AdminUserDetail }>(`/users/${id}/role`, input),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(['users', 'detail', id], user);
      void queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
      // Their branch or role changed, so review counts and family permissions may too.
      void queryClient.invalidateQueries({ queryKey: ['verifications'] });
      void queryClient.invalidateQueries({ queryKey: ['family'] });
    },
  });
}

export function useCreateResetCode() {
  return useMutation({
    mutationFn: async (userId: string) => (await api.post<{ reset: ResetCode }>(`/users/${userId}/reset-code`)).reset,
  });
}

export function useResetPassword() {
  return useMutation({ mutationFn: (input: ResetPasswordInput) => api.post<void>('/auth/reset-password', input) });
}

export function useChangePassword() {
  return useMutation({ mutationFn: (input: ChangePasswordInput) => api.post<void>('/auth/change-password', input) });
}
