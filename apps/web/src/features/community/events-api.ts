import type { EventDetail, EventInput, EventSummary, Language } from '@samaj/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useEvents(when: 'upcoming' | 'past') {
  return useQuery({
    queryKey: ['events', 'list', when],
    queryFn: async ({ signal }) => (await api.get<{ items: EventSummary[] }>('/events', { when }, signal)).items,
    placeholderData: keepPreviousData,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['events', 'detail', id],
    queryFn: async ({ signal }) => (await api.get<{ event: EventDetail }>(`/events/${id}`, undefined, signal)).event,
    enabled: Boolean(id),
  });
}

function useEventMutation<TVars, TResult>(run: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['events'] }) });
}

export const useSaveEvent = () =>
  useEventMutation(async ({ id, input }: { id: string | null; input: EventInput }) =>
    (await (id ? api.put<{ event: EventDetail }>(`/events/${id}`, input) : api.post<{ event: EventDetail }>('/events', input))).event,
  );

export const useRemoveEvent = () => useEventMutation((id: string) => api.delete<void>(`/events/${id}`));

export const useRsvp = (id: string) => useEventMutation(async (people: number) => (await api.put<{ event: EventDetail }>(`/events/${id}/rsvp`, { people })).event);

const locale = (language: Language) => (language === 'mr' ? 'mr-IN' : 'en-IN');

/** "Sat, 3 Oct · 9:00 am – 1:00 pm" in the viewer's language and time zone. */
export function formatEventTime(startsAt: string, endsAt: string | null, language: Language): string {
  const start = new Date(startsAt);
  const day = new Intl.DateTimeFormat(locale(language), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(start);
  const time = new Intl.DateTimeFormat(locale(language), { hour: 'numeric', minute: '2-digit' });
  const end = endsAt ? new Date(endsAt) : null;
  const sameDay = end && end.toDateString() === start.toDateString();
  if (!end) return `${day} · ${time.format(start)}`;
  if (sameDay) return `${day} · ${time.format(start)} – ${time.format(end)}`;
  return `${day} ${time.format(start)} – ${new Intl.DateTimeFormat(locale(language), { day: 'numeric', month: 'short' }).format(end)} ${time.format(end)}`;
}

/** Day and month for the calendar block on each card. */
export function dateParts(iso: string, language: Language) {
  const d = new Date(iso);
  return {
    day: new Intl.DateTimeFormat(locale(language), { day: 'numeric' }).format(d),
    month: new Intl.DateTimeFormat(locale(language), { month: 'short' }).format(d),
  };
}

/** ISO string to the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in local time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value (local time) to an ISO string with offset, or null when blank or invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
