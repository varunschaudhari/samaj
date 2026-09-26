import { type EventDetail, isGlobalRole } from '@samaj/shared';
import { MapPin } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Modal, Select, Textarea, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { fieldError } from '@/features/auth/form-errors';
import { branchName, useBranches } from '@/features/branches/api';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { fromLocalInput, toLocalInput, useSaveEvent } from './events-api';

/**
 * Date and time are edited as local "datetime-local" values and converted to
 * ISO on submit. The API validates everything; its field errors map back here
 * (startsAt -> startsLocal, endsAt -> endsLocal).
 */
interface FormValues {
  title: string;
  description: string;
  startsLocal: string;
  endsLocal: string;
  venue: string;
  mapUrl: string;
  branchId: string;
  rsvpEnabled: boolean;
}

const SERVER_TO_FORM: Record<string, keyof FormValues> = {
  title: 'title',
  description: 'description',
  startsAt: 'startsLocal',
  endsAt: 'endsLocal',
  venue: 'venue',
  mapUrl: 'mapUrl',
  branchId: 'branchId',
};

function defaults(event: EventDetail | null, branchId: string): FormValues {
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    startsLocal: toLocalInput(event?.startsAt ?? null),
    endsLocal: toLocalInput(event?.endsAt ?? null),
    venue: event?.venue ?? '',
    mapUrl: event?.mapUrl ?? '',
    branchId: event?.branch.id ?? branchId,
    rsvpEnabled: event?.rsvpEnabled ?? true,
  };
}

export function EventFormModal({ target, onClose, onSaved }: { target: EventDetail | 'new' | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const me = useMe();
  const branches = useBranches();
  const save = useSaveEvent();
  const event = target && target !== 'new' ? target : null;
  const form = useForm<FormValues>({ defaultValues: defaults(event, me.data?.branchId ?? '') });
  const { errors } = form.formState;

  useEffect(() => {
    if (target) {
      form.reset(defaults(event, me.data?.branchId ?? ''));
      save.reset();
    }
    // Once per opening.
  }, [target]);

  const user = me.data;
  const postable = (branches.data ?? []).filter((b) => (user && isGlobalRole(user.role)) || b.id === user?.branchId || b.parentId === user?.branchId);

  const onSubmit = form.handleSubmit((values) => {
    const startsAt = fromLocalInput(values.startsLocal);
    if (!startsAt) {
      form.setError('startsLocal', { message: 'validation.eventDate' });
      return;
    }
    save.mutate(
      {
        id: event?.id ?? null,
        input: {
          title: values.title,
          description: values.description,
          startsAt,
          endsAt: fromLocalInput(values.endsLocal),
          venue: values.venue,
          mapUrl: values.mapUrl,
          branchId: values.branchId,
          rsvpEnabled: values.rsvpEnabled,
        },
      },
      {
        onSuccess: (saved) => {
          toast.success(t(event ? 'events.saved' : 'events.created'));
          onClose();
          onSaved?.(saved.id);
        },
        onError: (err) => {
          if (!(err instanceof ApiError)) return;
          for (const issue of err.issues) {
            const field = SERVER_TO_FORM[issue.path];
            if (field) form.setError(field, { type: 'server', message: issue.message });
          }
        },
      },
    );
  });

  const err = (message: string | undefined) => fieldError(t, message);
  const hasFieldError = Object.values(errors).some((e) => e?.type === 'server');

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={event ? t('events.editTitle') : t('events.newTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="event-form" loading={save.isPending}>
            {event ? t('common.save') : t('events.create')}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {save.isError && !hasFieldError && <FormAlert message={errorMessage(save.error)} />}
        <Input label={t('notices.title')} error={err(errors.title?.message)} {...form.register('title')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('events.starts')} type="datetime-local" error={err(errors.startsLocal?.message)} {...form.register('startsLocal')} />
          <Input label={t('events.ends')} labelSuffix={t('common.optional')} type="datetime-local" error={err(errors.endsLocal?.message)} {...form.register('endsLocal')} />
        </div>
        <Input label={t('events.venue')} leadingIcon={MapPin} error={err(errors.venue?.message)} {...form.register('venue')} />
        <Input
          label={t('events.mapUrl')}
          labelSuffix={t('common.optional')}
          hint={t('events.mapUrlHint')}
          type="url"
          inputMode="url"
          placeholder="https://maps.google.com/…"
          error={err(errors.mapUrl?.message)}
          {...form.register('mapUrl')}
        />
        <Select label={t('notices.branch')} hint={t('notices.branchHint')} error={err(errors.branchId?.message)} {...form.register('branchId')}>
          {postable.map((b) => (
            <option key={b.id} value={b.id}>
              {branchName(b, language)}
              {b.kind === 'district' ? ` (${t('branchKind.district')})` : ''}
            </option>
          ))}
        </Select>
        <Textarea label={t('events.description')} labelSuffix={t('common.optional')} rows={4} error={err(errors.description?.message)} {...form.register('description')} />
        <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-sm bg-surface-muted px-3 text-sm text-fg">
          <input type="checkbox" className="size-5 shrink-0 accent-primary" {...form.register('rsvpEnabled')} />
          {t('events.rsvpToggle')}
        </label>
      </form>
    </Modal>
  );
}
