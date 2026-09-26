import type { PublicUser } from '@samaj/shared';
import { Clock, TriangleAlert, UserPlus } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, Icon, buttonVariants } from '@/components/ui';
import { branchName, useBranches } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';

/** Shown instead of the directory until the member's family is verified. */
export function VerificationNotice({ user }: { user: PublicUser }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const branches = useBranches();
  const branch = branches.data?.find((b) => b.id === user.branchId);
  const familyHref = `/families/${user.familyId}`;

  if (user.familyStatus === 'rejected') {
    return (
      <EmptyState
        tone="danger"
        icon={TriangleAlert}
        title={t('verify.rejected.title')}
        body={t('verify.rejected.body')}
        action={
          <Link to={familyHref} className={buttonVariants()}>
            {t('verify.openFamily')}
          </Link>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={Clock}
      title={t('verify.pending.title')}
      body={t('verify.pending.body', { branch: branch ? branchName(branch, language) : '…' })}
      action={
        <Link to={familyHref} className={buttonVariants()}>
          <Icon icon={UserPlus} />
          {t('verify.pending.action')}
        </Link>
      }
    />
  );
}
