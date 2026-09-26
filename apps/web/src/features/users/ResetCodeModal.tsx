import { formatResetCode } from '@samaj/shared';
import { Check, Copy, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, ErrorState, Icon, Modal, Skeleton } from '@/components/ui';
import { useLanguageStore, useT } from '@/i18n';
import { useCreateResetCode } from './api';

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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (target) {
      setCopied(false);
      create.mutate(target.userId);
    } else {
      create.reset();
    }
    // Once per opening, for this person.
  }, [target?.userId]);

  const code = create.data ? formatResetCode(create.data.code) : null;
  const expires = create.data
    ? new Intl.DateTimeFormat(language === 'mr' ? 'mr-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(create.data.expiresAt))
    : null;

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable; the code stays on screen to read or type.
    }
  };

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target ? t('reset.codeTitle', { name: target.name }) : ''}
      description={t('reset.codeBody')}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      {create.isPending && (
        <div className="flex flex-col items-center gap-3 py-4" aria-busy="true">
          <Skeleton className="h-14 w-60 rounded-md" />
          <Skeleton className="h-4 w-40" />
        </div>
      )}
      {create.isError && <ErrorState title={t('reset.codeFailed')} error={create.error} onRetry={() => target && create.mutate(target.userId)} />}
      {code && (
        <div className="flex flex-col items-center gap-3 py-2">
          <Icon icon={KeyRound} size="lg" className="text-primary" />
          <p className="rounded-md bg-surface-muted px-5 py-3 font-mono text-3xl font-semibold tracking-widest text-fg tabular-nums select-all" lang="en">
            {code}
          </p>
          <p className="text-sm text-fg-muted">{t('reset.codeExpires', { time: expires ?? '' })}</p>
          <Button variant="secondary" size="sm" leadingIcon={copied ? Check : Copy} onClick={copy}>
            {copied ? t('reset.copied') : t('reset.copy')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
