import { useEffect } from 'react';
import { Button, ErrorState, Modal } from '@/components/ui';
import { useLanguageStore, useT } from '@/i18n';
import { useCreateResetCode } from './api';
import { OneTimeCode, OneTimeCodeSkeleton } from './OneTimeCode';

interface ResetCodeModalProps {
  /** The account to reset, or null when closed. */
  target: { userId: string; name: string } | null;
  onClose: () => void;
}

/**
 * Creates a one-time code as soon as it opens and shows it large enough to
 * read out over the phone. Closing it doesn't cancel the code; it simply
 * expires after 30 minutes or once it has been used.
 */
export function ResetCodeModal({ target, onClose }: ResetCodeModalProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const create = useCreateResetCode();

  useEffect(() => {
    if (target) create.mutate(target.userId);
    else create.reset();
    // Once per opening, for this person.
  }, [target?.userId]);

  const expires = create.data
    ? new Intl.DateTimeFormat(language === 'mr' ? 'mr-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(create.data.expiresAt))
    : null;

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target ? t('reset.codeTitle', { name: target.name }) : ''}
      description={t('reset.codeBody')}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      {create.isPending && <OneTimeCodeSkeleton />}
      {create.isError && <ErrorState title={t('reset.codeFailed')} error={create.error} onRetry={() => target && create.mutate(target.userId)} />}
      {create.data && <OneTimeCode code={create.data.code} expiry={t('reset.codeExpires', { time: expires ?? '' })} />}
    </Modal>
  );
}
