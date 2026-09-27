import { zodResolver } from '@hookform/resolvers/zod';
import {
  DIETS,
  INCOME_RANGES,
  MANGLIK,
  MARITAL_STATUSES,
  NAKSHATRAS,
  RASHIS,
  type MyMatrimony,
  type ProfileDetail,
  type ProfileFieldsInput,
  profileCreateSchema,
  profileFieldsSchema,
} from '@samaj/shared';
import { ArrowLeft, ArrowRight, Phone, X } from '@/components/ui/icons';
import { useEffect, useState } from 'react';
import { type FieldPath, type Resolver, useForm } from 'react-hook-form';
import { Button, Chip, Input, Modal, Select, Textarea, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { branchName, useBranches } from '@/features/branches/api';
import { BranchSelect } from '@/features/branches/BranchSelect';
import { gotraOptions } from '@/features/families/gotra-options';
import { type MessageKey, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatHeight, useCreateProfile, useUpdateProfile } from './api';

export type ProfileFormTarget = { mode: 'create'; eligible: MyMatrimony['eligible']; memberId?: string } | { mode: 'edit'; profile: ProfileDetail };

const HEIGHTS = Array.from({ length: 61 }, (_, i) => 140 + i);
const AGES = Array.from({ length: 43 }, (_, i) => 18 + i);
const COUNTS = Array.from({ length: 11 }, (_, i) => i);

type FormValues = ProfileFieldsInput & { memberId?: string; consent?: boolean };
type Field = FieldPath<FormValues>;

/** The form in steps, so a long biodata isn't one wall of fields. Each step lists the fields it validates. */
const STEPS: { id: string; label: MessageKey; fields: Field[] }[] = [
  { id: 'basics', label: 'matrimony.step.basics', fields: ['memberId', 'heightCm', 'maritalStatus', 'diet'] },
  { id: 'horoscope', label: 'matrimony.step.horoscope', fields: ['birthDate', 'birthTime', 'birthPlace', 'rashi', 'nakshatra', 'manglik', 'maternalGotra'] },
  { id: 'career', label: 'matrimony.step.career', fields: ['education', 'occupation', 'workLocation', 'income'] },
  {
    id: 'family',
    label: 'matrimony.step.family',
    fields: ['fatherOccupation', 'motherOccupation', 'nativePlace', 'siblings.brothers', 'siblings.brothersMarried', 'siblings.sisters', 'siblings.sistersMarried'],
  },
  {
    id: 'preferences',
    label: 'matrimony.step.preferences',
    fields: ['about', 'expectations', 'preferences.ageMin', 'preferences.ageMax', 'preferences.heightMinCm', 'preferences.maritalStatuses', 'preferences.diets', 'preferences.branchIds'],
  },
  { id: 'contact', label: 'matrimony.step.contact', fields: ['contactName', 'contactPhone', 'consent'] },
];
const ALL_FIELDS = STEPS.flatMap((s) => s.fields);

const text = (v: string | null | undefined) => v ?? '';
const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function defaults(target: ProfileFormTarget | null, me: { name: string; phone: string } | undefined): FormValues {
  if (target?.mode === 'edit') {
    const p = target.profile;
    return {
      heightCm: num(p.heightCm),
      maritalStatus: text(p.maritalStatus),
      diet: text(p.diet),
      birthDate: text(p.birthDate),
      birthTime: text(p.birthTime),
      birthPlace: text(p.birthPlace),
      rashi: text(p.rashi),
      nakshatra: text(p.nakshatra),
      manglik: text(p.manglik),
      maternalGotra: text(p.maternalGotra),
      education: text(p.education),
      occupation: text(p.occupation),
      workLocation: text(p.workLocation),
      income: text(p.income),
      fatherOccupation: text(p.fatherOccupation),
      motherOccupation: text(p.motherOccupation),
      nativePlace: text(p.nativePlace),
      siblings: {
        brothers: num(p.siblings.brothers),
        brothersMarried: num(p.siblings.brothersMarried),
        sisters: num(p.siblings.sisters),
        sistersMarried: num(p.siblings.sistersMarried),
      },
      about: text(p.about),
      expectations: text(p.expectations),
      preferences: {
        ageMin: num(p.preferences.ageMin),
        ageMax: num(p.preferences.ageMax),
        heightMinCm: num(p.preferences.heightMinCm),
        maritalStatuses: p.preferences.maritalStatuses,
        diets: p.preferences.diets,
        branchIds: p.preferences.branches.map((b) => b.id),
      },
      contactName: p.contact?.name ?? '',
      contactPhone: p.contact?.phone ?? '',
    };
  }
  return {
    memberId: target?.memberId ?? target?.eligible[0]?.memberId ?? '',
    consent: false,
    heightCm: '',
    maritalStatus: 'neverMarried',
    diet: '',
    birthDate: '',
    birthTime: '',
    birthPlace: '',
    rashi: '',
    nakshatra: '',
    manglik: '',
    maternalGotra: '',
    education: '',
    occupation: '',
    workLocation: '',
    income: '',
    fatherOccupation: '',
    motherOccupation: '',
    nativePlace: '',
    siblings: { brothers: '', brothersMarried: '', sisters: '', sistersMarried: '' },
    about: '',
    expectations: '',
    preferences: { ageMin: '', ageMax: '', heightMinCm: '', maritalStatuses: [], diets: [], branchIds: [] },
    // Usually the parent creating the profile is the one families should call.
    contactName: me?.name ?? '',
    contactPhone: me?.phone ?? '',
  };
}

/** The error message for a (possibly nested) field, translated. */
function useFieldError(form: ReturnType<typeof useForm<FormValues>>) {
  const t = useT();
  return (name: Field) => fieldError(t, form.getFieldState(name, form.formState).error?.message);
}

/** Toggle chips for a multi-choice preference; none selected means "any". */
function ChoiceChips<V extends string>({ label, options, value, onChange, optionLabel }: { label: string; options: readonly V[]; value: V[]; onChange: (v: V[]) => void; optionLabel: (v: V) => string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-fg">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} selected={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>
            {optionLabel(o)}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

export function ProfileFormModal({ target, onClose, onCreated }: { target: ProfileFormTarget | null; onClose: () => void; onCreated?: (id: string) => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const me = useMe();
  const branches = useBranches();
  const create = useCreateProfile();
  const update = useUpdateProfile(target?.mode === 'edit' ? target.profile.id : '');
  const mutation = target?.mode === 'edit' ? update : create;
  const isCreate = target?.mode === 'create';
  const [step, setStep] = useState(0);

  const form = useForm<FormValues>({
    // Create and edit share every field; create adds memberId and consent. FormValues covers both,
    // and the parsed output fits it, so one form serves both schemas.
    resolver: (isCreate ? zodResolver(profileCreateSchema) : zodResolver(profileFieldsSchema)) as unknown as Resolver<FormValues>,
    defaultValues: defaults(target, me.data ?? undefined),
  });
  const err = useFieldError(form);

  useEffect(() => {
    if (target) {
      form.reset(defaults(target, me.data ?? undefined));
      create.reset();
      update.reset();
      setStep(0);
    }
    // Once per opening.
  }, [target]);

  // The birth date must fall in the birth year from the family page.
  const memberId = form.watch('memberId');
  const age = target?.mode === 'edit' ? target.profile.age : target?.eligible.find((e) => e.memberId === memberId)?.age;
  const birthYear = age !== null && age !== undefined ? new Date().getFullYear() - age : null;

  /** Jump to the first step with an error. */
  const showFirstError = () => {
    const index = STEPS.findIndex((s) => s.fields.some((f) => form.getFieldState(f).error));
    if (index >= 0) setStep(index);
  };

  const onSubmit = form.handleSubmit(
    (values) => {
      const onError = (e: unknown) => {
        applyServerIssues(e, ALL_FIELDS, form.setError);
        showFirstError();
      };
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
    },
    () => showFirstError(),
  );

  const next = async () => {
    const current = STEPS[step];
    if (current && (await form.trigger(current.fields))) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const last = step === STEPS.length - 1;
  const title = target?.mode === 'edit' ? t('matrimony.editTitle', { name: target.profile.name }) : t('matrimony.createTitle');
  const prefs = form.watch('preferences');
  const setPrefs = <K extends 'maritalStatuses' | 'diets' | 'branchIds'>(key: K, value: NonNullable<FormValues['preferences']>[K]) =>
    form.setValue(`preferences.${key}`, value as never, { shouldDirty: true });
  const hasServerError = ALL_FIELDS.some((f) => form.getFieldState(f).error?.type === 'server');

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={title}
      description={isCreate && step === 0 ? t('matrimony.createBody') : t('matrimony.stepOf', { n: step + 1, total: STEPS.length })}
      footer={
        <>
          {step > 0 ? (
            <Button variant="ghost" leadingIcon={ArrowLeft} onClick={() => setStep((s) => s - 1)}>
              {t('matrimony.form.back')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          )}
          {/* Editing can save from any step; creating walks to the end, where consent is. */}
          {!isCreate && !last && (
            <Button type="submit" form="profile-form" variant="secondary" loading={mutation.isPending}>
              {t('common.save')}
            </Button>
          )}
          {last ? (
            <Button type="submit" form="profile-form" loading={mutation.isPending}>
              {isCreate ? t('matrimony.submitForReview') : t('common.save')}
            </Button>
          ) : (
            <Button trailingIcon={ArrowRight} onClick={next}>
              {t('matrimony.form.next')}
            </Button>
          )}
        </>
      }
    >
      {/* Steps: tap one to jump there. */}
      <ol className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label={t('matrimony.stepOf', { n: step + 1, total: STEPS.length })}>
        {STEPS.map((s, i) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150',
                i === step ? 'bg-primary text-on-primary' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              <span className={cn('flex size-5 items-center justify-center rounded-full text-xs tabular-nums', i === step ? 'bg-on-primary/20' : 'bg-surface-muted')}>{i + 1}</span>
              {t(s.label)}
            </button>
          </li>
        ))}
      </ol>

      <form id="profile-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {mutation.isError && !hasServerError && <FormAlert message={errorMessage(mutation.error)} />}

        {step === 0 && (
          <>
            {target?.mode === 'create' && (
              <Select label={t('matrimony.person')} error={err('memberId')} {...form.register('memberId')}>
                {target.eligible.map((e) => (
                  <option key={e.memberId} value={e.memberId}>
                    {e.name} · {t('family.age', { age: e.age })}
                  </option>
                ))}
              </Select>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label={t('matrimony.maritalStatus')} error={err('maritalStatus')} {...form.register('maritalStatus')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {MARITAL_STATUSES.map((m) => (
                  <option key={m} value={m}>
                    {t(`matrimony.marital.${m}`)}
                  </option>
                ))}
              </Select>
              <Select label={t('matrimony.height')} labelSuffix={t('common.optional')} error={err('heightCm')} {...form.register('heightCm')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {HEIGHTS.map((cm) => (
                  <option key={cm} value={cm}>
                    {formatHeight(cm)}
                  </option>
                ))}
              </Select>
            </div>
            <Select label={t('matrimony.diet')} labelSuffix={t('common.optional')} error={err('diet')} {...form.register('diet')}>
              <option value="">{t('matrimony.notSaying')}</option>
              {DIETS.map((d) => (
                <option key={d} value={d}>
                  {t(`matrimony.diet.${d}`)}
                </option>
              ))}
            </Select>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('matrimony.birthDate')}
                labelSuffix={t('common.optional')}
                hint={birthYear ? t('matrimony.birthDateHint', { year: birthYear }) : undefined}
                type="date"
                min={birthYear ? `${birthYear}-01-01` : undefined}
                max={birthYear ? `${birthYear}-12-31` : undefined}
                error={err('birthDate')}
                {...form.register('birthDate')}
              />
              <Input label={t('matrimony.birthTime')} labelSuffix={t('common.optional')} type="time" error={err('birthTime')} {...form.register('birthTime')} />
            </div>
            <Input label={t('matrimony.birthPlace')} labelSuffix={t('common.optional')} error={err('birthPlace')} {...form.register('birthPlace')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label={t('matrimony.rashi')} labelSuffix={t('common.optional')} error={err('rashi')} {...form.register('rashi')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {RASHIS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r[language]}
                  </option>
                ))}
              </Select>
              <Select label={t('matrimony.nakshatra')} labelSuffix={t('common.optional')} error={err('nakshatra')} {...form.register('nakshatra')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {NAKSHATRAS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n[language]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label={t('matrimony.manglik')} labelSuffix={t('common.optional')} error={err('manglik')} {...form.register('manglik')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {MANGLIK.map((m) => (
                  <option key={m} value={m}>
                    {t(`matrimony.manglik.${m}`)}
                  </option>
                ))}
              </Select>
              <Select label={t('matrimony.maternalGotra')} labelSuffix={t('common.optional')} error={err('maternalGotra')} {...form.register('maternalGotra')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {gotraOptions(language).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Input label={t('member.education')} labelSuffix={t('common.optional')} placeholder="B.E. Computer, M.Com…" error={err('education')} {...form.register('education')} />
            <Input label={t('member.occupation')} labelSuffix={t('common.optional')} error={err('occupation')} {...form.register('occupation')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t('matrimony.workLocation')} labelSuffix={t('common.optional')} placeholder="Pune" error={err('workLocation')} {...form.register('workLocation')} />
              <Select label={t('matrimony.income')} labelSuffix={t('common.optional')} error={err('income')} {...form.register('income')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {INCOME_RANGES.map((r) => (
                  <option key={r} value={r}>
                    {t(`matrimony.income.${r}`)}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t('matrimony.fatherOccupation')} labelSuffix={t('common.optional')} error={err('fatherOccupation')} {...form.register('fatherOccupation')} />
              <Input label={t('matrimony.motherOccupation')} labelSuffix={t('common.optional')} error={err('motherOccupation')} {...form.register('motherOccupation')} />
            </div>
            <Input label={t('matrimony.nativePlace')} labelSuffix={t('common.optional')} hint={t('matrimony.nativePlaceHint')} error={err('nativePlace')} {...form.register('nativePlace')} />
            <div className="grid grid-cols-2 gap-4">
              {(['brothers', 'brothersMarried', 'sisters', 'sistersMarried'] as const).map((key) => (
                <Select key={key} label={t(`matrimony.form.${key}`)} labelSuffix={t('common.optional')} error={err(`siblings.${key}`)} {...form.register(`siblings.${key}`)}>
                  <option value="">{t('matrimony.notSaying')}</option>
                  {COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <Textarea label={t('matrimony.about')} labelSuffix={t('common.optional')} hint={t('matrimony.aboutHint')} rows={3} error={err('about')} {...form.register('about')} />
            <fieldset className="flex flex-col gap-4 rounded-md border border-line p-4">
              <legend className="px-1 text-sm font-semibold text-fg">{t('matrimony.expectations')}</legend>
              <p className="text-sm text-fg-muted">{t('matrimony.pref.hint')}</p>
              <div className="grid grid-cols-2 gap-4">
                <Select label={t('matrimony.pref.ageMin')} error={err('preferences.ageMin')} {...form.register('preferences.ageMin')}>
                  <option value="">{t('matrimony.pref.any')}</option>
                  {AGES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
                <Select label={t('matrimony.pref.ageMax')} error={err('preferences.ageMax')} {...form.register('preferences.ageMax')}>
                  <option value="">{t('matrimony.pref.any')}</option>
                  {AGES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </div>
              <Select label={t('matrimony.pref.heightMin')} error={err('preferences.heightMinCm')} {...form.register('preferences.heightMinCm')}>
                <option value="">{t('matrimony.pref.any')}</option>
                {HEIGHTS.map((cm) => (
                  <option key={cm} value={cm}>
                    {formatHeight(cm)}
                  </option>
                ))}
              </Select>
              <ChoiceChips
                label={t('matrimony.maritalStatus')}
                options={MARITAL_STATUSES}
                value={prefs?.maritalStatuses ?? []}
                onChange={(v) => setPrefs('maritalStatuses', v)}
                optionLabel={(m) => t(`matrimony.marital.${m}`)}
              />
              <ChoiceChips label={t('matrimony.diet')} options={DIETS} value={prefs?.diets ?? []} onChange={(v) => setPrefs('diets', v)} optionLabel={(d) => t(`matrimony.diet.${d}`)} />
              <div className="flex flex-col gap-2">
                <BranchSelect
                  label={t('matrimony.pref.branches')}
                  hideLabel={false}
                  allLabel={t('matrimony.pref.addBranch')}
                  value=""
                  fieldClassName="w-full"
                  onChange={(id) => id && !(prefs?.branchIds ?? []).includes(id) && setPrefs('branchIds', [...(prefs?.branchIds ?? []), id])}
                />
                <p className="text-sm text-fg-muted">{t('matrimony.pref.branchesHint')}</p>
                {(prefs?.branchIds ?? []).length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {(prefs?.branchIds ?? []).map((id) => {
                      const b = branches.data?.find((x) => x.id === id);
                      return (
                        <li key={id}>
                          <Chip selected icon={X} onClick={() => setPrefs('branchIds', (prefs?.branchIds ?? []).filter((x) => x !== id))} aria-label={t('matrimony.pref.removeBranch', { name: b ? branchName(b, language) : '' })}>
                            {b ? branchName(b, language) : '…'}
                          </Chip>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <Textarea label={t('matrimony.pref.inWords')} labelSuffix={t('common.optional')} rows={3} error={err('expectations')} {...form.register('expectations')} />
            </fieldset>
          </>
        )}

        {step === 5 && (
          <>
            <fieldset className="flex flex-col gap-4 rounded-md border border-line p-4">
              <legend className="px-1 text-sm font-semibold text-fg">{t('matrimony.contact')}</legend>
              <p className="text-sm text-fg-muted">{t('matrimony.contactHint')}</p>
              <Input label={t('matrimony.contactName')} error={err('contactName')} {...form.register('contactName')} />
              <Input label={t('member.phone')} type="tel" inputMode="numeric" leadingIcon={Phone} error={err('contactPhone')} {...form.register('contactPhone')} />
            </fieldset>
            {isCreate && (
              <div className="flex flex-col gap-1.5">
                <label className="flex min-h-touch cursor-pointer items-start gap-3 rounded-sm bg-surface-muted p-3 text-sm text-fg">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" {...form.register('consent')} />
                  <span>{t('matrimony.consent')}</span>
                </label>
                {err('consent') && <p className="text-sm text-danger">{err('consent')}</p>}
              </div>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
