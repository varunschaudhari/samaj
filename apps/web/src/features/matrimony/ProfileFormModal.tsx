import { zodResolver } from '@hookform/resolvers/zod';
import {
  INCOME_RANGES,
  MANGLIK,
  type MyMatrimony,
  type ProfileDetail,
  type ProfileFieldsInput,
  profileCreateSchema,
  profileFieldsSchema,
} from '@samaj/shared';
import { Phone } from 'lucide-react';
import { useEffect } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { Button, Input, Modal, Select, Textarea, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { gotraOptions } from '@/features/families/gotra-options';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { formatHeight, useCreateProfile, useUpdateProfile } from './api';

export type ProfileFormTarget = { mode: 'create'; eligible: MyMatrimony['eligible']; memberId?: string } | { mode: 'edit'; profile: ProfileDetail };

const HEIGHTS = Array.from({ length: 61 }, (_, i) => 140 + i);
const FIELDS = ['memberId', 'consent', 'heightCm', 'education', 'occupation', 'income', 'manglik', 'maternalGotra', 'about', 'expectations', 'contactName', 'contactPhone'] as const;

type FormValues = ProfileFieldsInput & { memberId?: string; consent?: boolean };

function defaults(target: ProfileFormTarget | null, me: { name: string; phone: string } | undefined): FormValues {
  if (target?.mode === 'edit') {
    const p = target.profile;
    return {
      heightCm: p.heightCm ? String(p.heightCm) : '',
      education: p.education ?? '',
      occupation: p.occupation ?? '',
      income: p.income ?? '',
      manglik: p.manglik ?? '',
      maternalGotra: p.maternalGotra ?? '',
      about: p.about ?? '',
      expectations: p.expectations ?? '',
      contactName: p.contact?.name ?? '',
      contactPhone: p.contact?.phone ?? '',
    };
  }
  return {
    memberId: target?.memberId ?? target?.eligible[0]?.memberId ?? '',
    consent: false,
    heightCm: '',
    education: '',
    occupation: '',
    income: '',
    manglik: '',
    maternalGotra: '',
    about: '',
    expectations: '',
    // Usually the parent creating the profile is the one families should call.
    contactName: me?.name ?? '',
    contactPhone: me?.phone ?? '',
  };
}

export function ProfileFormModal({ target, onClose, onCreated }: { target: ProfileFormTarget | null; onClose: () => void; onCreated?: (id: string) => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const me = useMe();
  const create = useCreateProfile();
  const update = useUpdateProfile(target?.mode === 'edit' ? target.profile.id : '');
  const mutation = target?.mode === 'edit' ? update : create;
  const isCreate = target?.mode === 'create';

  const form = useForm<FormValues>({
    // Create and edit share every field; create adds memberId and consent. FormValues covers both,
    // and the parsed output fits it, so one form serves both schemas.
    resolver: (isCreate ? zodResolver(profileCreateSchema) : zodResolver(profileFieldsSchema)) as unknown as Resolver<FormValues>,
    defaultValues: defaults(target, me.data ?? undefined),
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (target) {
      form.reset(defaults(target, me.data ?? undefined));
      create.reset();
      update.reset();
    }
    // Once per opening.
  }, [target]);

  const onSubmit = form.handleSubmit((values) => {
    const onError = (err: unknown) => applyServerIssues(err, FIELDS, form.setError);
    if (target?.mode === 'edit') {
      const { memberId: _m, consent: _c, ...fields } = values;
      update.mutate(fields, {
        onSuccess: () => {
          toast.success(t('matrimony.saved'));
          onClose();
        },
        onError,
      });
    } else {
      create.mutate(values as Parameters<typeof create.mutate>[0], {
        onSuccess: (profile) => {
          toast.success(t('matrimony.created', { name: profile.name }));
          onClose();
          onCreated?.(profile.id);
        },
        onError,
      });
    }
  });

  const title = target?.mode === 'edit' ? t('matrimony.editTitle', { name: target.profile.name }) : t('matrimony.createTitle');

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={title}
      description={isCreate ? t('matrimony.createBody') : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="profile-form" loading={mutation.isPending}>
            {isCreate ? t('matrimony.submitForReview') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id="profile-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {mutation.isError && !FIELDS.some((f) => errors[f]?.type === 'server') && <FormAlert message={errorMessage(mutation.error)} />}

        {target?.mode === 'create' && (
          <Select label={t('matrimony.person')} error={fieldError(t, errors.memberId?.message)} {...form.register('memberId')}>
            {target.eligible.map((e) => (
              <option key={e.memberId} value={e.memberId}>
                {e.name} · {t('family.age', { age: e.age })}
              </option>
            ))}
          </Select>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t('matrimony.height')} labelSuffix={t('common.optional')} error={fieldError(t, errors.heightCm?.message)} {...form.register('heightCm')}>
            <option value="">{t('matrimony.notSaying')}</option>
            {HEIGHTS.map((cm) => (
              <option key={cm} value={cm}>
                {formatHeight(cm)}
              </option>
            ))}
          </Select>
          <Select label={t('matrimony.manglik')} labelSuffix={t('common.optional')} error={fieldError(t, errors.manglik?.message)} {...form.register('manglik')}>
            <option value="">{t('matrimony.notSaying')}</option>
            {MANGLIK.map((m) => (
              <option key={m} value={m}>
                {t(`matrimony.manglik.${m}`)}
              </option>
            ))}
          </Select>
        </div>
        <Input label={t('member.education')} labelSuffix={t('common.optional')} placeholder="B.E. Computer, M.Com…" error={fieldError(t, errors.education?.message)} {...form.register('education')} />
        <Input label={t('member.occupation')} labelSuffix={t('common.optional')} error={fieldError(t, errors.occupation?.message)} {...form.register('occupation')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t('matrimony.income')} labelSuffix={t('common.optional')} error={fieldError(t, errors.income?.message)} {...form.register('income')}>
            <option value="">{t('matrimony.notSaying')}</option>
            {INCOME_RANGES.map((r) => (
              <option key={r} value={r}>
                {t(`matrimony.income.${r}`)}
              </option>
            ))}
          </Select>
          <Select label={t('matrimony.maternalGotra')} labelSuffix={t('common.optional')} error={fieldError(t, errors.maternalGotra?.message)} {...form.register('maternalGotra')}>
            <option value="">{t('matrimony.notSaying')}</option>
            {gotraOptions(language).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
        <Textarea label={t('matrimony.about')} labelSuffix={t('common.optional')} rows={3} error={fieldError(t, errors.about?.message)} {...form.register('about')} />
        <Textarea
          label={t('matrimony.expectations')}
          labelSuffix={t('common.optional')}
          rows={3}
          error={fieldError(t, errors.expectations?.message)}
          {...form.register('expectations')}
        />
        <fieldset className="flex flex-col gap-4 rounded-md border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-fg">{t('matrimony.contact')}</legend>
          <p className="text-sm text-fg-muted">{t('matrimony.contactHint')}</p>
          <Input label={t('matrimony.contactName')} error={fieldError(t, errors.contactName?.message)} {...form.register('contactName')} />
          <Input
            label={t('member.phone')}
            type="tel"
            inputMode="numeric"
            leadingIcon={Phone}
            error={fieldError(t, errors.contactPhone?.message)}
            {...form.register('contactPhone')}
          />
        </fieldset>

        {isCreate && (
          <div className="flex flex-col gap-1.5">
            <label className="flex min-h-touch cursor-pointer items-start gap-3 rounded-sm bg-surface-muted p-3 text-sm text-fg">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" {...form.register('consent')} />
              <span>{t('matrimony.consent')}</span>
            </label>
            {errors.consent?.message && <p className="text-sm text-danger">{fieldError(t, errors.consent.message)}</p>}
          </div>
        )}
      </form>
    </Modal>
  );
}
