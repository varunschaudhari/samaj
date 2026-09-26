import type { Notice, NoticeFeed, NoticeInput, NoticeKind } from '@samaj/shared';
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useNotices(kind: NoticeKind | '') {
  return useInfiniteQuery({
    queryKey: ['notices', kind],
    queryFn: ({ pageParam, signal }) => api.get<NoticeFeed>('/notices', { kind, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

function useNoticeMutation<TVars, TResult>(run: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notices'] }),
  });
}

export const useSaveNotice = () =>
  useNoticeMutation(async ({ id, input }: { id: string | null; input: NoticeInput }) =>
    (await (id ? api.put<{ notice: Notice }>(`/notices/${id}`, input) : api.post<{ notice: Notice }>('/notices', input))).notice,
  );

export const useRemoveNotice = () => useNoticeMutation((id: string) => api.delete<void>(`/notices/${id}`));
