import type { InvitationSummary } from '@samaj/shared';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Skeleton, buttonVariants, toast } from '@/components/ui';
import { ChevronRight, Mail, Plus } from '@/components/ui/icons';
import { placeLabel } from '@/features/branches/api';
import { formatDate, formatNumber, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useHideFamily, useMyInvitations } from './api';
import { isRemembrance } from './kinds';

function InvitationRow({ inv, hosting }: { inv: InvitationSummary; hosting: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const n = (v: number) => formatNumber(v, language);
  const dates = formatDate(inv.firstAt, language) + (inv.lastAt.slice(0, 10) !== inv.firstAt.slice(0, 10) ? ` – ${formatDate(inv.lastAt, language)}` : '');
  return (
    <li>
      <Link
        to={`/invitations/${inv.id}`}
        className={cn('flex items-center gap-3 rounded-md border px-4 py-3 hover:bg-surface-muted', isRemembrance(inv.kind) ? 'border-line' : 'border-zari-soft', inv.closed && 'opacity-70')}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-fg">
              {t(`invite.kind.${inv.kind}`)}
              {inv.forNames && `: ${inv.forNames}`}
            </span>
            {inv.cancelled ? (
              <Badge tone="danger">{t('invite.cancelledBadge')}</Badge>
            ) : inv.closed ? (
              <Badge>{t('invite.list.over')}</Badge>
            ) : (
              !hosting && !inv.answered && <Badge tone="warning">{t('invite.list.notAnswered')}</Badge>
            )}
          </span>
          <span className="text-sm text-fg-muted">
            {!hosting && `${t('invite.from', { name: inv.host.headName })} · ${placeLabel(inv.host.place, inv.host.branch, language)} · `}
            {dates}
            {inv.functionCount > 1 && ` · ${t('invite.list.functions', { count: n(inv.functionCount) })}`}
          </span>
          {hosting && <span className="text-sm text-fg">{t('invite.replies', { replied: n(inv.repliedCount ?? 0), invited: n(inv.invitedCount ?? 0) })}</span>}
        </span>
        <Icon icon={ChevronRight} className="shrink-0 text-fg-muted" />
      </Link>
    </li>
  );
}

/** Invitations to the viewer's family, the ones it sent, and families it has hidden. */
export function InvitationsPage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const mine = useMyInvitations();
  const hide = useHideFamily();

  const newButton = mine.data?.canHost && (
    <Link to="/invitations/new" className={buttonVariants({ variant: 'primary' })}>
      <Icon icon={Plus} />
      {t('invite.new')}
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader title={t('invite.page.title')} description={t('invite.page.description')} actions={newButton || undefined} />
      {mine.isPending ? (
        <Skeleton className="h-60 w-full rounded-lg" />
      ) : mine.isError ? (
        <ErrorState title={t('invite.error')} error={mine.error} onRetry={() => mine.refetch()} retrying={mine.isFetching} />
      ) : (
        <>
          <Card as="section" aria-labelledby="invited" className="flex flex-col gap-3">
            <h2 id="invited" className="font-display text-lg font-semibold text-fg">
              {t('invite.list.invited')}
            </h2>
            {mine.data.invited.length === 0 ? (
              <EmptyState icon={Mail} title={t('invite.list.noneInvited')} body={t('invite.list.noneInvitedBody')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {mine.data.invited.map((inv) => (
                  <InvitationRow key={inv.id} inv={inv} hosting={false} />
                ))}
              </ul>
            )}
          </Card>

          {(mine.data.canHost || mine.data.hosting.length > 0) && (
            <Card as="section" aria-labelledby="hosting" className="flex flex-col gap-3">
              <h2 id="hosting" className="font-display text-lg font-semibold text-fg">
                {t('invite.list.hosting')}
              </h2>
              {mine.data.hosting.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('invite.list.noneHosting')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {mine.data.hosting.map((inv) => (
                    <InvitationRow key={inv.id} inv={inv} hosting />
                  ))}
                </ul>
              )}
            </Card>
          )}

          {mine.data.hidden.length > 0 && (
            <Card as="section" aria-labelledby="hidden" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="hidden" className="font-display text-lg font-semibold text-fg">
                  {t('invite.hidden.title')}
                </h2>
                <p className="text-sm text-fg-muted">{t('invite.hidden.body')}</p>
              </div>
              <ul className="divide-y divide-line">
                {mine.data.hidden.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-fg">{t('family.title', { name: f.headName })}</span>
                      <span className="text-xs text-fg-muted">{placeLabel(f.place, f.branch, language)}</span>
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={hide.isPending && hide.variables?.familyId === f.id}
                      onClick={() => hide.mutate({ familyId: f.id, hidden: false }, { onSuccess: () => toast.success(t('invite.hidden.shown')) })}
                    >
                      {t('invite.hidden.show')}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
