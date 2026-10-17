import type { CandidateType, Language, Melava, MelavaDetail, MelavaInput, MelavaOfficeRegisterInput, MelavaRegisterInput, OfficeCandidate } from '@samaj/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type MessageKey, formatNumber } from '@/i18n';
import { api } from '@/lib/api';

const keys = {
  list: ['melavas'] as const,
  one: (id: string) => ['melavas', id] as const,
};

export function useMelavas() {
  return useQuery({
    queryKey: keys.list,
    queryFn: async ({ signal }) => (await api.get<{ items: Melava[] }>('/melavas', undefined, signal)).items,
  });
}

export function useMelava(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    queryFn: async ({ signal }) => (await api.get<{ melava: MelavaDetail }>(`/melavas/${id}`, undefined, signal)).melava,
    enabled: Boolean(id),
  });
}

/** Every melava change returns the melava; keep it and refresh the list's counts. */
function useMelavaMutation<V>(run: (vars: V) => Promise<{ melava: MelavaDetail }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: V) => (await run(vars)).melava,
    onSuccess: (melava) => {
      queryClient.setQueryData(keys.one(melava.id), melava);
      void queryClient.invalidateQueries({ queryKey: keys.list, exact: true });
      // The office search shows each person's registration, so it changes too.
      void queryClient.invalidateQueries({ queryKey: ['melavas', melava.id, 'office'] });
    },
  });
}

export function useSaveMelava(id: string | null) {
  return useMelavaMutation((input: MelavaInput) => (id ? api.put(`/melavas/${id}`, input) : api.post('/melavas', input)));
}

export function useRegisterForMelava(id: string) {
  return useMelavaMutation((input: MelavaRegisterInput) => api.post(`/melavas/${id}/registrations`, input));
}

/** People the office can help at the counter, by name or mobile. */
export function useOfficeSearch(id: string, q: string) {
  return useQuery({
    queryKey: ['melavas', id, 'office', q],
    queryFn: async ({ signal }) => (await api.get<{ items: OfficeCandidate[] }>(`/melavas/${id}/office-search`, { q }, signal)).items,
    enabled: q.trim().length >= 2,
    staleTime: 0,
  });
}

export function useOfficeRegister(id: string) {
  return useMelavaMutation((input: MelavaOfficeRegisterInput) => api.post(`/melavas/${id}/office-registrations`, input));
}

export function useRegistrationAction(id: string) {
  const verify = useMelavaMutation((registrationId: string) => api.post(`/melavas/${id}/registrations/${registrationId}/verify`));
  const cancel = useMelavaMutation(({ registrationId, reason }: { registrationId: string; reason: string }) =>
    api.post(`/melavas/${id}/registrations/${registrationId}/cancel`, { reason }),
  );
  return { verify, cancel };
}

/** Download the booklet list. A plain link would work too, but this keeps the file name the server chose. */
export async function downloadBooklet(id: string, language: Language): Promise<void> {
  const res = await fetch(`/api/melavas/${id}/export.csv?lang=${language}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1] ?? 'melava.csv');
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** "वधू क्र. 12" / "Bride no. 12". */
export function candidateLabel(t: (key: MessageKey, values?: Record<string, string | number>) => string, type: CandidateType, n: number, language: Language): string {
  return t(`melava.candidate.${type}`, { n: formatNumber(n, language) });
}

/** "Sunday, 25 December 2026". */
export function formatMelavaDate(iso: string, language: Language): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(language === 'mr' ? 'mr-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1)),
  );
}
