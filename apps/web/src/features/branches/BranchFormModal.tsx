import { zodResolver } from '@hookform/resolvers/zod';
import { type BranchCreateInput, type BranchSummary, branchCreateSchema } from '@samaj/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Modal, Select, toast } from '@/components/ui';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { branchName } from './api';
import { useCreateBranch, useUpdateBranch } from './admin-api';

export type BranchFormTarget =
  | { mode: 'addDistrict' }
  | { mode: 'addPlace'; district: BranchSummary }
  | { mode: 'rename'; branch: BranchSummary };

const FIELDS = ['name', 'nameMr', 'kind', 'parentId'] as const;

function defaults(target: BranchFormTarget | null): BranchCreateInput {
  if (target?.mode === 'rename') {
    const b = target.branch;
    return { name: b.name, nameMr: b.nameMr, kind: b.kind, parentId: b.parentId };
  }
  if (target?.mode === 'addPlace') return { name: '', nameMr: '', kind: 'town', parentId: target.district.id };
  return { name: '', nameMr: '', kind: 'district', parentId: null };
}

/** Add a district, add a city or town inside one, or rename any branch. */
export function BranchFormModal({ target, onClose }: { target: BranchFormTarget | null; onClose: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const saving = create.isPending || update.isPending;
  const failed = target?.mode === 'rename' ? update : create;

  // Rename sends name and nameMr only; the create schema still validates them the same way.
  const form = useForm({ resolver: zodResolver(branchCreateSchema), defaultValues: defaults(target) });
  const { errors } = form.formState;

  useEffect(() => {
    if (target) {
      form.reset(defaults(target));
      create.reset();
      update.reset();
    }
    // Only when the modal opens for a new target; resetting on every render would wipe typing.
  }, [target]);

  const title =
    target?.mode === 'rename'
      ? t('branches.editTitle', { name: branchName(target.branch, language) })
      : target?.mode === 'addPlace'
        ? t('branches.addPlaceTitle', { district: branchName(target.district, language) })
        : t('branches.addDistrictTitle');

  const onSubmit = form.handleSubmit((values) => {
    const done = (key: 'branches.saved' | 'branches.added') => () => {
      toast.success(t(key, { name: language === 'mr' ? values.nameMr : values.name }));
      onClose();
    };
    const onError = (err: unknown) => applyServerIssues(err, FIELDS, form.setError);
    if (target?.mode === 'rename') {
      update.mutate({ id: target.branch.id, input: { name: values.name, nameMr: values.nameMr } }, { onSuccess: done('branches.saved'), onError });
    } else {
      create.mutate(values, { onSuccess: done('branches.added'), onError });
    }
  });

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="branch-form" loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="branch-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {failed.isError && !FIELDS.some((f) => errors[f]?.type === 'server') && <FormAlert message={errorMessage(failed.error)} />}
        <Input label={t('branches.nameEn')} lang="en" autoComplete="off" error={fieldError(t, errors.name?.message)} {...form.register('name')} />
        <Input
          label={t('branches.nameMr')}
          lang="mr"
          hint={t('branches.nameMrHint')}
          autoComplete="off"
          error={fieldError(t, errors.nameMr?.message)}
          {...form.register('nameMr')}
        />
        {target?.mode === 'addPlace' && (
          <Select label={t('branches.kind')} error={fieldError(t, errors.kind?.message)} {...form.register('kind')}>
            <option value="town">{t('branchKind.town')}</option>
            <option value="city">{t('branchKind.city')}</option>
          </Select>
        )}
        {errors.parentId?.message && <FormAlert message={fieldError(t, errors.parentId.message) ?? ''} />}
      </form>
    </Modal>
  );
}
