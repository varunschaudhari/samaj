import { zodResolver } from '@hookform/resolvers/zod';
import { type FamilyDetail, rejectFamilySchema } from '@samaj/shared';
import { BadgeCheck, MessageSquareWarning, Send } from '@/components/ui/icons';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Card, CardTitle, Modal, Textarea, toast } from '@/components/ui';
import { FormAlert } from '@/features/auth/FormAlert';
import { fieldError } from '@/features/auth/form-errors';
import { useErrorMessage, useT } from '@/i18n';
import { useReview } from './api';

/** Verify / ask for changes. Shown to a reviewer while the family is pending. */
export function ReviewPanel({ family }: { family: FamilyDetail }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const { verify, reject } = useReview(family.id);
  const [rejectOpen, setRejectOpen] = useState(false);
  const form = useForm({ resolver: zodResolver(rejectFamilySchema), defaultValues: { reason: '' } });

  const onVerify = () =>
    verify.mutate(undefined, {
      onSuccess: () => toast.success(t('review.verified')),
      onError: (err) => toast.error(errorMessage(err)),
    });

  const onReject = form.handleSubmit(({ reason }) =>
    reject.mutate(reason, {
      onSuccess: () => {
        toast.success(t('review.rejected'));
        setRejectOpen(false);
        form.reset();
      },
    }),
  );

  return (
    <Card variant="raised" className="flex flex-col gap-3 border-primary">
      <CardTitle>{t('review.title')}</CardTitle>
      <p className="max-w-prose text-sm text-fg-muted">{t('review.body')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button leadingIcon={BadgeCheck} onClick={onVerify} loading={verify.isPending}>
          {t('review.verify')}
        </Button>
        <Button variant="secondary" leadingIcon={MessageSquareWarning} onClick={() => setRejectOpen(true)} disabled={verify.isPending}>
          {t('review.reject')}
        </Button>
      </div>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={t('review.rejectTitle')}
        description={t('review.rejectBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="reject-form" variant="danger" leadingIcon={Send} loading={reject.isPending}>
              {t('review.send')}
            </Button>
          </>
        }
      >
        <form id="reject-form" onSubmit={onReject} noValidate className="flex flex-col gap-3">
          {reject.isError && <FormAlert message={errorMessage(reject.error)} />}
          <Textarea
            label={t('review.reason')}
            placeholder={t('review.reasonPlaceholder')}
            rows={4}
            error={fieldError(t, form.formState.errors.reason?.message)}
            {...form.register('reason')}
          />
        </form>
      </Modal>
    </Card>
  );
}
