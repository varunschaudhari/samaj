import { HeartHandshake, Info, Plus } from '@/components/ui/icons';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, EmptyState, ErrorState, Icon, buttonVariants } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { useT } from '@/i18n';
import { useMyMatrimony } from './api';
import { ProfileCardSkeleton, ProfileCardView } from './ProfileCardView';
import { type ProfileFormTarget, ProfileFormModal } from './ProfileFormModal';

export function MyProfilesPage() {
  const t = useT();
  const me = useMe();
  const mine = useMyMatrimony();
  const [formTarget, setFormTarget] = useState<ProfileFormTarget | null>(null);

  if (mine.isPending) {
    return (
      <ul className="grid gap-3 md:grid-cols-2" aria-busy="true">
        {[0, 1].map((i) => (
          <ProfileCardSkeleton key={i} />
        ))}
      </ul>
    );
  }
  if (mine.isError) return <ErrorState title={t('matrimony.error.title')} error={mine.error} onRetry={() => mine.refetch()} retrying={mine.isFetching} />;

  const { profiles, eligible, ineligible } = mine.data;
  const familyHref = me.data ? `/families/${me.data.familyId}` : '/family';

  return (
    <div className="flex flex-col gap-5">
      {profiles.length === 0 ? (
        <EmptyState
          icon={HeartHandshake}
          title={t('matrimony.none.title')}
          body={eligible.length ? t('matrimony.none.body') : t('matrimony.none.noEligible')}
          action={
            eligible.length ? (
              <Button leadingIcon={Plus} onClick={() => setFormTarget({ mode: 'create', eligible })}>
                {t('matrimony.create')}
              </Button>
            ) : (
              <Link to={familyHref} className={buttonVariants({ variant: 'secondary' })}>
                {t('verify.openFamily')}
              </Link>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {profiles.map((p) => (
            <ProfileCardView key={p.id} profile={p} href={`/matrimony/profiles/${p.id}`} showStatus />
          ))}
        </ul>
      )}

      {profiles.length > 0 && eligible.length > 0 && (
        <Card variant="muted" className="flex flex-col gap-3">
          <p className="text-sm text-fg">{t('matrimony.moreEligible', { names: eligible.map((e) => e.name).join(', ') })}</p>
          <Button variant="secondary" leadingIcon={Plus} className="self-start" onClick={() => setFormTarget({ mode: 'create', eligible })}>
            {t('matrimony.create')}
          </Button>
        </Card>
      )}

      {ineligible.length > 0 && (
        <ul className="flex flex-col gap-2">
          {ineligible.map((m) => (
            <li key={m.memberId} className="flex items-start gap-2 text-sm text-fg-muted">
              <Icon icon={Info} size="sm" className="mt-0.5" />
              <span>
                {t(m.reason === 'noBirthYear' ? 'matrimony.ineligible.noBirthYear' : 'matrimony.ineligible.tooYoung', { name: m.name })}{' '}
                {m.reason === 'noBirthYear' && (
                  <Link to={familyHref} className="font-semibold text-primary underline-offset-4 hover:underline">
                    {t('verify.openFamily')}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ProfileFormModal target={formTarget} onClose={() => setFormTarget(null)} />
    </div>
  );
}
