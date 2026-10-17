import { zodResolver } from '@hookform/resolvers/zod';
import {
  BIRTH_TIMES_OF_DAY,
  DIETS,
  EDUCATION_LEVELS,
  EMPLOYER_TYPES,
  INCOME_VISIBILITY,
  MANGLIK,
  MARITAL_STATUSES,
  MAX_PROMPTS,
  type MissingField,
  PROMPT_IDS,
  NAKSHATRAS,
  RASHIS,
  REQUIRED_FOR_REVIEW,
  type MyMatrimony,
  type ProfileDetail,
  type ProfileFieldsInput,
  profileCreateSchema,
  profileFieldsSchema,
  timeOfDayOf,
} from '@samaj/shared';
import { ArrowLeft, ArrowRight, Phone, Plus, Send, Trash2, X } from '@/components/ui/icons';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type FieldPath, type Resolver, useForm } from 'react-hook-form';
import { Button, Chip, IconButton, Input, Modal, Select, Textarea, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { branchName, useBranches } from '@/features/branches/api';
import { BranchSelect } from '@/features/branches/BranchSelect';
import { gotraOptions } from '@/features/families/gotra-options';
import { type MessageKey, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatHeight, useCreateProfile, usePrefill, useUpdateProfile } from './api';

export type ProfileFormTarget =
  /** contact: who to call, when the office fills the form for a family; otherwise the signed-in parent. */
  | { mode: 'create'; eligible: MyMatrimony['eligible']; memberId?: string; contact?: { name: string; phone: string | null } }
  /** startAt: open on the step holding this field, from the checklist. */
  | { mode: 'edit'; profile: ProfileDetail; startAt?: MissingField };

const HEIGHTS = Array.from({ length: 61 }, (_, i) => 140 + i);
const AGES = Array.from({ length: 43 }, (_, i) => 18 + i);
const COUNTS = Array.from({ length: 11 }, (_, i) => i);

type FormValues = ProfileFieldsInput & { memberId?: string; consent?: boolean };
type Field = FieldPath<FormValues>;

/** The form in steps, following the samaj's paper form. Each step lists the fields it validates. */
const STEPS: { id: string; label: MessageKey; fields: Field[] }[] = [
  { id: 'candidate', label: 'matrimony.step.candidate', fields: ['memberId', 'surname', 'firstName', 'fatherName', 'maritalStatus', 'heightCm', 'diet', 'hasDisability', 'disabilityDetail'] },
  { id: 'birth', label: 'matrimony.step.birth', fields: ['birthDate', 'birthTimeOfDay', 'birthTime', 'birthPlace', 'rashi', 'nakshatra', 'manglik'] },
  {
    id: 'career',
    label: 'matrimony.step.career',
    fields: ['educationLevel', 'education', 'otherEducation', 'occupation', 'employerType', 'employerName', 'employerAddress', 'designation', 'workLocation', 'monthlyIncome', 'incomeVisibility'],
  },
  {
    id: 'family',
    label: 'matrimony.step.family',
    fields: [
      'parentName',
      'parentOccupation',
      'parentWorkVillage',
      'motherOccupation',
      'nativeVillage',
      'nativeDistrict',
      'siblings.brothers',
      'siblings.brothersMarried',
      'siblings.sisters',
      'siblings.sistersMarried',
      'mamaName',
      'mamaKul',
      'mamaVillage',
      'mamaNativeVillage',
      'mamaNativeDistrict',
      'mamaMobile',
    ],
  },
  {
    id: 'preferences',
    label: 'matrimony.step.preferences',
    fields: ['about', 'prompts', 'expectations', 'preferences.ageMin', 'preferences.ageMax', 'preferences.heightMinCm', 'preferences.maritalStatuses', 'preferences.diets', 'preferences.branchIds'],
  },
  {
    id: 'contact',
    label: 'matrimony.step.contact',
    fields: ['addressLine', 'village', 'taluka', 'district', 'pincode', 'contactName', 'contactPhone', 'candidateMobile', 'parentWhatsapp', 'consent'],
  },
];
const ALL_FIELDS = STEPS.flatMap((s) => s.fields);
const REQUIRED = new Set<string>(REQUIRED_FOR_REVIEW);

const text = (v: string | null | undefined) => v ?? '';
const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function defaults(target: ProfileFormTarget | null, me: { name: string; phone: string } | undefined): FormValues {
  if (target?.mode === 'edit') {
    const p = target.profile;
    const a = p.contact?.address;
    return {
      surname: text(p.surname),
      firstName: text(p.firstName),
      fatherName: text(p.fatherName),
      heightCm: num(p.heightCm),
      maritalStatus: text(p.maritalStatus),
      diet: text(p.diet),
      hasDisability: p.hasDisability,
      disabilityDetail: text(p.disabilityDetail),
      birthDate: text(p.birthDate),
      birthTimeOfDay: text(p.birthTimeOfDay),
      birthTime: text(p.birthTime),
      birthPlace: text(p.birthPlace),
      rashi: text(p.rashi),
      nakshatra: text(p.nakshatra),
      manglik: text(p.manglik),
      educationLevel: text(p.educationLevel),
      education: text(p.education),
      otherEducation: text(p.otherEducation),
      occupation: text(p.occupation),
      employerType: text(p.employerType),
      employerName: text(p.employerName),
      employerAddress: text(p.contact?.employerAddress),
      designation: text(p.designation),
      workLocation: text(p.workLocation),
      monthlyIncome: num(p.monthlyIncome),
      incomeVisibility: p.incomeVisibility,
      parentName: text(p.parentName),
      parentOccupation: text(p.parentOccupation),
      parentWorkVillage: text(p.parentWorkVillage),
      motherOccupation: text(p.motherOccupation),
      nativeVillage: text(p.nativeVillage),
      nativeDistrict: text(p.nativeDistrict),
      siblings: {
        brothers: num(p.siblings.brothers),
        brothersMarried: num(p.siblings.brothersMarried),
        sisters: num(p.siblings.sisters),
        sistersMarried: num(p.siblings.sistersMarried),
      },
      mamaName: text(p.mamaName),
      mamaKul: text(p.mamaKul),
      mamaVillage: text(p.mamaVillage),
      mamaNativeVillage: text(p.mamaNativeVillage),
      mamaNativeDistrict: text(p.mamaNativeDistrict),
      mamaMobile: text(p.contact?.mamaMobile),
      addressLine: text(a?.line),
      village: text(a?.village),
      taluka: text(a?.taluka),
      district: text(a?.district),
      pincode: text(a?.pincode),
      about: text(p.about),
      prompts: p.prompts,
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
      candidateMobile: text(p.contact?.candidateMobile),
      parentWhatsapp: text(p.contact?.parentWhatsapp),
    };
  }
  const person = target?.eligible.find((e) => e.memberId === (target.memberId ?? target.eligible[0]?.memberId));
  const [first = '', ...rest] = (person?.name ?? '').split(' ');
  const contact = target?.mode === 'create' && target.contact ? { name: target.contact.name, phone: target.contact.phone ?? '' } : me;
  return {
    memberId: person?.memberId ?? '',
    consent: false,
    // Prefilled from the family page: given name first, surname last, as names are listed there.
    surname: rest.at(-1) ?? '',
    firstName: first,
    fatherName: '',
    heightCm: '',
    maritalStatus: 'neverMarried',
    diet: '',
    hasDisability: false,
    disabilityDetail: '',
    birthDate: '',
    birthTimeOfDay: '',
    birthTime: '',
    birthPlace: '',
    rashi: '',
    nakshatra: '',
    manglik: '',
    educationLevel: '',
    education: '',
    otherEducation: '',
    occupation: '',
    employerType: '',
    employerName: '',
    employerAddress: '',
    designation: '',
    workLocation: '',
    monthlyIncome: '',
    incomeVisibility: 'accepted',
    parentName: contact?.name ?? '',
    parentOccupation: '',
    parentWorkVillage: '',
    motherOccupation: '',
    nativeVillage: '',
    nativeDistrict: '',
    siblings: { brothers: '', brothersMarried: '', sisters: '', sistersMarried: '' },
    mamaName: '',
    mamaKul: '',
    mamaVillage: '',
    mamaNativeVillage: '',
    mamaNativeDistrict: '',
    mamaMobile: '',
    addressLine: '',
    village: '',
    taluka: '',
    district: '',
    pincode: '',
    about: '',
    prompts: [],
    expectations: '',
    preferences: { ageMin: '', ageMax: '', heightMinCm: '', maritalStatuses: [], diets: [], branchIds: [] },
    // Usually the parent creating the profile is the one families should call, on WhatsApp too.
    contactName: contact?.name ?? '',
    contactPhone: contact?.phone ?? '',
    candidateMobile: '',
    parentWhatsapp: contact?.phone ?? '',
  };
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

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-md border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-fg">{title}</legend>
      {hint && <p className="-mt-1 text-sm text-fg-muted">{hint}</p>}
      {children}
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
  // New profiles start with only the fields the samaj form requires; the rest are a tap away.
  const [showAll, setShowAll] = useState(false);
  // Which create button was pressed: keep as a draft, or send for approval.
  const sendRef = useRef(false);

  const form = useForm<FormValues>({
    // Create and edit share every field; create adds memberId and consent. FormValues covers both,
    // and the parsed output fits it, so one form serves both schemas.
    resolver: (isCreate ? zodResolver(profileCreateSchema) : zodResolver(profileFieldsSchema)) as unknown as Resolver<FormValues>,
    defaultValues: defaults(target, me.data ?? undefined),
  });
  const err = (name: Field) => fieldError(t, form.getFieldState(name, form.formState).error?.message);
  /** Required-for-approval fields carry no "optional" tag; the rest do. */
  const opt = (name: string) => (REQUIRED.has(name) ? undefined : t('common.optional'));
  /** Whether a field is on screen: always when required (or who sees income), otherwise when all fields are shown. */
  const shown = (name: string) => showAll || REQUIRED.has(name) || name === 'incomeVisibility';

  useEffect(() => {
    if (target) {
      form.reset(defaults(target, me.data ?? undefined));
      create.reset();
      update.reset();
      const startAt = target.mode === 'edit' ? target.startAt : undefined;
      const index = startAt ? STEPS.findIndex((s) => s.fields.includes(startAt as Field)) : -1;
      setStep(Math.max(0, index));
      setShowAll(target.mode === 'edit');
    }
    // Once per opening.
  }, [target]);

  // An exact time fills in its band, so families only type one.
  const birthTime = form.watch('birthTime');
  useEffect(() => {
    if (typeof birthTime === 'string' && /^\d{2}:\d{2}$/.test(birthTime)) form.setValue('birthTimeOfDay', timeOfDayOf(birthTime), { shouldDirty: true });
  }, [birthTime]);

  // The birth date must fall in the birth year from the family page.
  const memberId = form.watch('memberId');
  const age = target?.mode === 'edit' ? target.profile.age : target?.eligible.find((e) => e.memberId === memberId)?.age;
  const birthYear = age !== null && age !== undefined ? new Date().getFullYear() - age : null;
  const hasDisability = form.watch('hasDisability');

  // Start a new profile from the family page: names, parents, siblings, places and phones.
  // Facts about the person themselves follow the chosen person; the rest only fill blanks.
  const prefill = usePrefill(isCreate ? memberId : undefined);
  useEffect(() => {
    const data = prefill.data;
    if (!data) return;
    // parentName too: the family page gives it surname first, as the samaj form wants.
    const personal = new Set(['surname', 'firstName', 'fatherName', 'parentName', 'education', 'occupation', 'candidateMobile']);
    for (const [key, value] of Object.entries(data)) {
      if (key === 'siblings' && value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) form.setValue(`siblings.${k}` as Field, String(v) as never);
        continue;
      }
      const current = form.getValues(key as Field);
      if (personal.has(key) || current === '' || current === undefined || current === null) form.setValue(key as Field, value as never);
    }
  }, [prefill.data]);
  const prompts = form.watch('prompts') ?? [];
  const setPrompts = (next: NonNullable<FormValues['prompts']>) => form.setValue('prompts', next, { shouldDirty: true });

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
        const submit = sendRef.current;
        create.mutate({ ...(values as Parameters<typeof create.mutate>[0]), submit }, {
          onSuccess: (profile) => {
            toast.success(submit ? t('matrimony.created', { name: profile.name }) : t('matrimony.draftSaved', { name: profile.name }));
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
  const hasFieldError = ALL_FIELDS.some((f) => form.getFieldState(f).error?.type === 'server');

  const input = (name: Field, label: string, props: Record<string, unknown> = {}) =>
    shown(name) ? <Input label={label} labelSuffix={opt(name)} error={err(name)} {...props} {...form.register(name)} /> : null;
  /** A short list of choices as big tap buttons instead of a dropdown. Tapping the chosen one again clears an optional choice. */
  const choice = <V extends string>(name: Field, label: string, values: readonly V[], optionLabel: (v: V) => string) => {
    if (!shown(name)) return null;
    const value = form.watch(name) as unknown as string | undefined;
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold text-fg">
          {label}
          {opt(name) && <span className="font-normal text-fg-muted"> ({opt(name)})</span>}
        </legend>
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <Chip
              key={v}
              selected={value === v}
              onClick={() =>
                form.setValue(name, (value === v && !REQUIRED.has(name) && name !== 'incomeVisibility' ? '' : v) as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })
              }
            >
              {optionLabel(v)}
            </Chip>
          ))}
        </div>
        {err(name) && <p className="text-sm text-danger">{err(name)}</p>}
      </fieldset>
    );
  };
  const phone = (name: Field, label: string, hint?: string) => input(name, label, { type: 'tel', inputMode: 'numeric', leadingIcon: Phone, hint });

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
          {/* A draft can be saved from any step; sending needs the last step, where consent is. */}
          {isCreate ? (
            <Button type="submit" form="profile-form" variant="secondary" loading={create.isPending && !sendRef.current} onClick={() => (sendRef.current = false)}>
              {t('matrimony.saveDraft')}
            </Button>
          ) : (
            !last && (
              <Button type="submit" form="profile-form" variant="secondary" loading={mutation.isPending}>
                {t('common.save')}
              </Button>
            )
          )}
          {last ? (
            isCreate ? (
              <Button type="submit" form="profile-form" leadingIcon={Send} loading={create.isPending && sendRef.current} onClick={() => (sendRef.current = true)}>
                {t('matrimony.submitForReview')}
              </Button>
            ) : (
              <Button type="submit" form="profile-form" loading={mutation.isPending}>
                {t('common.save')}
              </Button>
            )
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
        {mutation.isError && !hasFieldError && <FormAlert message={errorMessage(mutation.error)} />}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm">
          <span className="text-fg-muted">{showAll ? t('matrimony.form.allShown') : t('matrimony.form.requiredOnly')}</span>
          <button type="button" className="min-h-9 font-semibold text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? t('matrimony.form.showRequired') : t('matrimony.form.showAll')}
          </button>
        </div>

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
            <div className="grid gap-4 sm:grid-cols-3">
              {input('surname', t('matrimony.surname'))}
              {input('firstName', t('matrimony.firstName'))}
              {input('fatherName', t('matrimony.fatherName'), { hint: t('matrimony.fatherNameHint') })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {choice('maritalStatus', t('matrimony.maritalStatus'), MARITAL_STATUSES, (m) => t(`matrimony.marital.${m}`))}
              <Select label={t('matrimony.height')} labelSuffix={opt('heightCm')} error={err('heightCm')} {...form.register('heightCm')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {HEIGHTS.map((cm) => (
                  <option key={cm} value={cm}>
                    {formatHeight(cm)}
                  </option>
                ))}
              </Select>
            </div>
            {choice('diet', t('matrimony.diet'), DIETS, (d) => t(`matrimony.diet.${d}`))}
            <label className="flex min-h-touch cursor-pointer items-center gap-3 text-sm text-fg">
              <input type="checkbox" className="size-5 shrink-0 accent-primary" {...form.register('hasDisability')} />
              {t('matrimony.hasDisability')}
            </label>
            {hasDisability && <Textarea label={t('matrimony.disabilityDetail')} rows={2} error={err('disabilityDetail')} {...form.register('disabilityDetail')} />}
          </>
        )}

        {step === 1 && (
          <>
            <Input
              label={t('matrimony.birthDate')}
              hint={birthYear ? t('matrimony.birthDateHint', { year: birthYear }) : undefined}
              type="date"
              min={birthYear ? `${birthYear}-01-01` : undefined}
              max={birthYear ? `${birthYear}-12-31` : undefined}
              error={err('birthDate')}
              {...form.register('birthDate')}
            />
            {choice('birthTimeOfDay', t('matrimony.timeOfDay'), BIRTH_TIMES_OF_DAY, (b) => t(`matrimony.timeOfDay.${b}`))}
            {input('birthTime', t('matrimony.exactTime'), { type: 'time', hint: t('matrimony.exactTimeHint') })}
            {input('birthPlace', t('matrimony.birthPlace'))}
            {showAll && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label={t('matrimony.rashi')} labelSuffix={opt('rashi')} error={err('rashi')} {...form.register('rashi')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {RASHIS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r[language]}
                  </option>
                ))}
              </Select>
              <Select label={t('matrimony.nakshatra')} labelSuffix={opt('nakshatra')} error={err('nakshatra')} {...form.register('nakshatra')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {NAKSHATRAS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n[language]}
                  </option>
                ))}
              </Select>
            </div>
            )}
            {choice('manglik', t('matrimony.manglik'), MANGLIK, (m) => t(`matrimony.manglik.${m}`))}
          </>
        )}

        {step === 2 && (
          <>
            {choice('educationLevel', t('matrimony.educationLevel'), EDUCATION_LEVELS, (e) => t(`matrimony.educationLevel.${e}`))}
            {input('education', t('matrimony.degree'), { placeholder: 'B.E. Mechanical' })}
            {input('otherEducation', t('matrimony.otherEducation'))}
            {input('occupation', t('member.occupation'))}
            {choice('employerType', t('matrimony.employerType'), EMPLOYER_TYPES, (e) => t(`matrimony.employerType.${e}`))}
            <div className="grid gap-4 sm:grid-cols-2">
              {input('employerName', t('matrimony.employerName'))}
              {input('designation', t('matrimony.designation'))}
            </div>
            {input('employerAddress', t('matrimony.employerAddress'))}
            {input('workLocation', t('matrimony.workLocation'), { placeholder: 'Pune' })}
            <Group title={t('matrimony.monthlyIncome')} hint={t('matrimony.incomeHint')}>
              {input('monthlyIncome', t('matrimony.monthlyIncomeAmount'), { inputMode: 'numeric', placeholder: '45000' })}
              {choice('incomeVisibility', t('matrimony.incomeVisibility'), INCOME_VISIBILITY, (v) => t(`matrimony.incomeVisibility.${v}`))}
            </Group>
          </>
        )}

        {step === 3 && (
          <>
            <Group title={t('matrimony.section.parent')}>
              {input('parentName', t('matrimony.parentName'), { hint: t('matrimony.surnameFirst') })}
              <div className="grid gap-4 sm:grid-cols-2">
                {input('parentOccupation', t('matrimony.parentOccupation'))}
                {input('parentWorkVillage', t('matrimony.parentWorkVillage'))}
              </div>
              {input('motherOccupation', t('matrimony.motherOccupation'))}
              <div className="grid gap-4 sm:grid-cols-2">
                {input('nativeVillage', t('matrimony.nativeVillage'))}
                {input('nativeDistrict', t('matrimony.nativeDistrict'))}
              </div>
              {showAll && (
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
              )}
            </Group>
            <Group title={t('matrimony.section.mama')} hint={t('matrimony.mamaHint')}>
              {input('mamaName', t('matrimony.mamaName'), { hint: t('matrimony.surnameFirst') })}
              <Select label={t('matrimony.mamaKul')} error={err('mamaKul')} {...form.register('mamaKul')}>
                <option value="">{t('matrimony.notSaying')}</option>
                {gotraOptions(language).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
              {input('mamaVillage', t('matrimony.mamaVillage'))}
              <div className="grid gap-4 sm:grid-cols-2">
                {input('mamaNativeVillage', t('matrimony.mamaNativeVillage'))}
                {input('mamaNativeDistrict', t('matrimony.nativeDistrict'))}
              </div>
              {phone('mamaMobile', t('matrimony.mamaMobile'))}
            </Group>
          </>
        )}

        {step === 4 && !showAll && (
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-line-strong p-4">
            <p className="text-sm text-fg">{t('matrimony.form.optionalStep')}</p>
            <Button variant="secondary" size="sm" onClick={() => setShowAll(true)}>
              {t('matrimony.form.showAll')}
            </Button>
          </div>
        )}
        {step === 4 && showAll && (
          <>
            <Textarea label={t('matrimony.about')} labelSuffix={t('common.optional')} hint={t('matrimony.aboutHint')} rows={3} error={err('about')} {...form.register('about')} />
            <Group title={t('matrimony.prompts.title')} hint={t('matrimony.prompts.hint', { max: MAX_PROMPTS })}>
              {prompts.map((item, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
                  <div className="flex items-end gap-2">
                    <Select
                      label={t('matrimony.prompts.question')}
                      fieldClassName="flex-1"
                      value={item.prompt}
                      onChange={(e) => setPrompts(prompts.map((x, j) => (j === i ? { ...x, prompt: e.target.value as (typeof PROMPT_IDS)[number] } : x)))}
                    >
                      {PROMPT_IDS.filter((id) => id === item.prompt || !prompts.some((x) => x.prompt === id)).map((id) => (
                        <option key={id} value={id}>
                          {t(`matrimony.prompt.${id}`)}
                        </option>
                      ))}
                    </Select>
                    <IconButton icon={Trash2} label={t('matrimony.prompts.remove')} onClick={() => setPrompts(prompts.filter((_, j) => j !== i))} />
                  </div>
                  <Textarea
                    label={t('matrimony.prompts.answer')}
                    hideLabel
                    rows={2}
                    maxLength={200}
                    placeholder={t('matrimony.prompts.placeholder')}
                    value={item.answer}
                    error={err(`prompts.${i}.answer` as Field)}
                    onChange={(e) => setPrompts(prompts.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                  />
                </div>
              ))}
              {prompts.length < MAX_PROMPTS && (
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={Plus}
                  className="self-start"
                  onClick={() => {
                    const unused = PROMPT_IDS.find((id) => !prompts.some((x) => x.prompt === id));
                    if (unused) setPrompts([...prompts, { prompt: unused, answer: '' }]);
                  }}
                >
                  {t('matrimony.prompts.add')}
                </Button>
              )}
            </Group>
            <Group title={t('matrimony.expectations')} hint={t('matrimony.pref.hint')}>
              <div className="grid grid-cols-2 gap-4">
                {(['ageMin', 'ageMax'] as const).map((key) => (
                  <Select key={key} label={t(`matrimony.pref.${key}`)} error={err(`preferences.${key}`)} {...form.register(`preferences.${key}`)}>
                    <option value="">{t('matrimony.pref.any')}</option>
                    {AGES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                ))}
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
            </Group>
          </>
        )}

        {step === 5 && (
          <>
            <Group title={t('matrimony.section.address')}>
              {input('addressLine', t('matrimony.addressLine'))}
              <div className="grid gap-4 sm:grid-cols-2">
                {input('village', t('matrimony.village'))}
                {input('taluka', t('matrimony.taluka'))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {input('district', t('matrimony.district'))}
                {input('pincode', t('matrimony.pincode'), { inputMode: 'numeric', maxLength: 6 })}
              </div>
            </Group>
            <Group title={t('matrimony.contact')} hint={t('matrimony.contactHint')}>
              <div className="grid gap-4 sm:grid-cols-2">
                {input('contactName', t('matrimony.contactName'))}
                {phone('contactPhone', t('matrimony.mobile'))}
              </div>
              {phone('candidateMobile', t('matrimony.candidateMobile'))}
              {phone('parentWhatsapp', t('matrimony.parentWhatsapp'), t('matrimony.parentWhatsappHint'))}
            </Group>
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
