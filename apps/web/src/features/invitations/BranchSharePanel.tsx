import type { InvitationDetail } from '@samaj/shared';
import { Link } from 'react-router';
import { Button, Card, Icon, toast } from '@/components/ui';
import { Megaphone } from '@/components/ui/icons';
import { FormAlert } from '@/features/auth/FormAlert';
import { branchName } from '@/features/branches/api';
import { formatDate, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useRequestBranchShare } from './api';
import { isRemembrance } from './kinds';

/**
 * Asking the branch committee to share the invitation with the whole branch:
 * a notice there, with the card's link. For a दशक्रिया the whole branch
 * should know of, or a function open to all.
 */
export function BranchSharePanel({ invitation }: { invitation: InvitationDetail }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const ask = useRequestBranchShare(invitation.id);
  const share = invitation.branchShare ?? null;
  if (invitation.closed && share?.status !== 'shared') return null;
  const branch = share ? branchName(share.branch, language) : null;

  return (
    <Card as="section" aria-labelledby="branch-share" className="flex flex-col gap-3 print:hidden">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon icon={Megaphone} weight="duotone" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="branch-share" className="font-display text-lg font-semibold text-fg">
            {t('invite.branch.title')}
          </h2>
          <p className="text-sm text-fg-muted">
            {!share
              ? t(isRemembrance(invitation.kind) ? 'invite.branch.hintRemembrance' : 'invite.branch.hint')
              : share.status === 'pending'
                ? t('invite.branch.pending', { branch: branch ?? '', date: formatDate(share.requestedAt, language) })
                : share.status === 'shared'
                  ? t('invite.branch.shared', { branch: branch ?? '', name: share.decidedByName ?? '' })
                  : t('invite.branch.declined', { name: share.decidedByName ?? '' })}
          </p>
          {share?.status === 'declined' && share.reason && <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-fg">“{share.reason}”</p>}
        </div>
      </div>
      {ask.isError && <FormAlert message={errorMessage(ask.error)} />}
      <div className="flex flex-wrap gap-2">
        {(!share || share.status === 'declined') && (
          <Button variant="secondary" size="sm" leadingIcon={Megaphone} loading={ask.isPending} onClick={() => ask.mutate(true, { onSuccess: () => toast.success(t('invite.branch.asked')) })}>
            {t(share ? 'invite.branch.askAgain' : 'invite.branch.ask')}
          </Button>
        )}
        {share?.status === 'pending' && (
          <Button variant="ghost" size="sm" loading={ask.isPending} onClick={() => ask.mutate(false, { onSuccess: () => toast.success(t('invite.branch.withdrawn')) })}>
            {t('invite.branch.withdraw')}
          </Button>
        )}
        {share?.status === 'shared' && (
          <Link to="/community/notices" className="text-sm font-semibold text-primary hover:underline">
            {t('invite.branch.seeNotice')}
          </Link>
        )}
      </div>
    </Card>
  );
}
