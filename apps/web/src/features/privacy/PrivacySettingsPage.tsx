import { type PhoneVisibility, PRIVACY_NOTICE_VERSION } from '@samaj/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, CardTitle, ErrorState, Icon, Skeleton, buttonVariants, toast } from '@/components/ui';
import { ArrowLeft, Download, ExternalLink, ShieldCheck, Trash2, TriangleAlert, Undo2 } from '@/components/ui/icons';
import { useMe } from '@/features/auth/api';
import { formatDate, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { downloadMyData, useCancelDeletion, usePrivacyStatus, useSetMemberPrivacy } from './api';
import { DeleteDataModal, PrivacyFields } from './PrivacyControls';

/** /profile/privacy: the notice, who sees your phone, download, and deletion. */
export function PrivacySettingsPage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const me = useMe();
  const status = usePrivacyStatus();
  const save = useSetMemberPrivacy();
  const cancel = useCancelDeletion();
  const [value, setValue] = useState<{ phoneVisibility: PhoneVisibility; listed: boolean } | null>(null);
  const [deleting, setDeleting] = useState<'self' | 'family' | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (status.data && !value) setValue({ phoneVisibility: status.data.phoneVisibility, listed: status.data.listed });
  }, [status.data]);

  const back = (
    <Link to="/profile" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      <Icon icon={ArrowLeft} />
      {t('nav.profile')}
    </Link>
  );

  if (status.isPending) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }
  if (status.isError) return <ErrorState title={t('privacy.statusError')} error={status.error} onRetry={() => status.refetch()} retrying={status.isFetching} />;
  const s = status.data;
  const changed = value && (value.phoneVisibility !== s.phoneVisibility || value.listed !== s.listed);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>{back}</div>
      <PageHeader title={t('privacy.settingsTitle')} description={t('privacy.settingsSubtitle')} />

      {s.deletion && (
        <Card className="flex flex-col gap-3 border-danger bg-danger-soft" role="status">
          <p className="flex items-start gap-2 font-semibold text-fg">
            <Icon icon={TriangleAlert} className="mt-0.5 text-danger" />
            {t(s.deletion.scope === 'family' ? 'privacy.pendingFamily' : 'privacy.pendingSelf', { date: formatDate(s.deletion.dueAt, language) })}
          </p>
          <Button
            variant="secondary"
            leadingIcon={Undo2}
            className="self-start"
            loading={cancel.isPending}
            onClick={() => cancel.mutate(undefined, { onSuccess: () => toast.success(t('privacy.cancelled')), onError: (err) => toast.error(errorMessage(err)) })}
          >
            {t('privacy.cancelDeletion')}
          </Button>
        </Card>
      )}

      <Card padding="lg" className="flex flex-col gap-3">
        <CardTitle className="flex items-center gap-2">
          <Icon icon={ShieldCheck} weight="duotone" className="text-primary" />
          {t('privacy.noticeTitle')}
        </CardTitle>
        <p className="text-sm text-fg-muted">
          {s.consentedAt
            ? t('privacy.agreedOn', { date: formatDate(s.consentedAt, language), version: formatDate(`${PRIVACY_NOTICE_VERSION}T00:00:00`, language) })
            : t('privacy.notAgreed')}
        </p>
        <Link to="/privacy" target="_blank" rel="noopener" className="flex min-h-touch items-center gap-1.5 self-start text-sm font-semibold text-primary hover:underline">
          {t('privacy.readNotice')}
          <Icon icon={ExternalLink} size="sm" />
        </Link>
      </Card>

      <Card padding="lg" className="flex flex-col gap-4">
        <CardTitle>{t('privacy.whoSees')}</CardTitle>
        {value && <PrivacyFields {...value} onChange={setValue} forSelf />}
        <Button
          className="self-start"
          disabled={!changed}
          loading={save.isPending}
          onClick={() =>
            value &&
            me.data &&
            save.mutate({ memberId: me.data.memberId, input: value }, { onSuccess: () => toast.success(t('privacy.saved')), onError: (err) => toast.error(errorMessage(err)) })
          }
        >
          {t('common.save')}
        </Button>
      </Card>

      <Card padding="lg" className="flex flex-col gap-3">
        <CardTitle>{t('privacy.downloadTitle')}</CardTitle>
        <p className="max-w-prose text-sm text-fg-muted">{t('privacy.downloadBody')}</p>
        <Button
          variant="secondary"
          leadingIcon={Download}
          className="self-start"
          loading={downloading}
          onClick={() => {
            setDownloading(true);
            downloadMyData()
              .then(() => toast.success(t('privacy.downloaded')))
              .catch(() => toast.error(t('privacy.downloadFailed')))
              .finally(() => setDownloading(false));
          }}
        >
          {t('privacy.download')}
        </Button>
      </Card>

      {!s.deletion && (
        <Card padding="lg" className="flex flex-col gap-3">
          <CardTitle>{t('privacy.deleteTitle')}</CardTitle>
          <p className="max-w-prose text-sm text-fg-muted">{t('privacy.deleteIntro')}</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Button variant="danger" leadingIcon={Trash2} className="self-start" disabled={!s.canDeleteSelf} onClick={() => setDeleting('self')}>
                {t('privacy.deleteSelf')}
              </Button>
              {s.deleteSelfBlockedBy && <p className="text-sm text-fg-muted">{t(`privacy.blocked.${s.deleteSelfBlockedBy}`)}</p>}
            </div>
            {s.deleteFamilyBlockedBy !== 'notHead' && (
              <div className="flex flex-col gap-1">
                <Button variant="secondary" leadingIcon={Trash2} className="self-start text-danger" disabled={!s.canDeleteFamily} onClick={() => setDeleting('family')}>
                  {t('privacy.deleteFamily')}
                </Button>
                {s.deleteFamilyBlockedBy === 'otherAccounts' && <p className="text-sm text-fg-muted">{t('privacy.blocked.otherAccounts')}</p>}
              </div>
            )}
          </div>
        </Card>
      )}

      <DeleteDataModal scope={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
