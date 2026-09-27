import type { InvitationDetail } from '@samaj/shared';
import { useState } from 'react';
import { Button, Card, Icon, Modal, toast } from '@/components/ui';
import { Copy, Globe } from '@/components/ui/icons';
import { FormAlert } from '@/features/auth/FormAlert';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { publicLink, useShareLink } from './api';

/**
 * The link for relatives and friends not on the app: off until the host
 * turns it on. Anyone with it sees the card and can reply with a name.
 * Turning it off stops that link for good; turning it on again makes a new one.
 */
export function ShareLinkPanel({ invitation }: { invitation: InvitationDetail }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const link = useShareLink(invitation.id);
  const [confirmOff, setConfirmOff] = useState(false);
  const token = invitation.shareToken;
  if (!token && invitation.closed) return null;
  const url = token ? publicLink(token, language) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('invite.link.copied'));
    } catch {
      // The clipboard is unavailable: the link is on screen to copy by hand.
    }
  };

  return (
    <Card as="section" aria-labelledby="share-link" className="flex flex-col gap-3 print:hidden">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
          <Icon icon={Globe} weight="duotone" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="share-link" className="font-display text-lg font-semibold text-fg">
            {t('invite.link.title')}
          </h2>
          <p className="text-sm text-fg-muted">{token ? t('invite.link.onHint') : t('invite.link.offHint')}</p>
        </div>
      </div>
      {link.isError && <FormAlert message={errorMessage(link.error)} />}
      {token ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg" title={url}>
            {url}
          </code>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" leadingIcon={Copy} onClick={() => void copy()}>
              {t('invite.link.copy')}
            </Button>
            <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmOff(true)}>
              {t('invite.link.turnOff')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" leadingIcon={Globe} className="self-start" loading={link.isPending} onClick={() => link.mutate(true, { onSuccess: () => toast.success(t('invite.link.turnedOn')) })}>
          {t('invite.link.turnOn')}
        </Button>
      )}

      <Modal
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title={t('invite.link.turnOff')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOff(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={link.isPending}
              onClick={() =>
                link.mutate(false, {
                  onSuccess: () => {
                    toast.success(t('invite.link.turnedOff'));
                    setConfirmOff(false);
                  },
                })
              }
            >
              {t('invite.link.turnOff')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg">{t('invite.link.offConfirm')}</p>
      </Modal>
    </Card>
  );
}
