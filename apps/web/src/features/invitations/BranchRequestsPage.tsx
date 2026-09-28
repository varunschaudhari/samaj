import type { BranchShareRequest } from '@samaj/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, EmptyState, ErrorState, Icon, Input, Modal, Skeleton, Textarea, buttonVariants, toast } from '@/components/ui';
import { ArrowLeft, CircleCheck, Megaphone } from '@/components/ui/icons';
import { FormAlert } from '@/features/auth/FormAlert';
import { fieldError } from '@/features/auth/form-errors';
import { placeLabel } from '@/features/branches/api';
import { formatDate, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { publicLink, useBranchRequests, useDecideBranchShare } from './api';
import { InvitationCard } from './InvitationCard';
import { cardFrom, isRemembrance, shareText } from './kinds';

/** One family's request: the card, and the notice the committee will post, to check and edit. */
function Request({ request }: { request: BranchShareRequest }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const decide = useDecideBranchShare();
  const quiet = isRemembrance(request.kind);
  const link = publicLink(request.shareToken, language);
  const kind = t(`invite.kind.${request.kind}`);
  const [title, setTitle] = useState(quiet ? `${t('invite.card.inMemory')}: ${request.forNames ?? kind}` : `${kind}${request.forNames ? `: ${request.forNames}` : ''}`);
  const [body, setBody] = useState(() =>
    shareText(request, { kind, from: t('invite.from', { name: request.host.headName }), open: t('invite.branch.noticeLink') }, language, link).replace(/^\*[^\n]*\*\n/, ''),
  );
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const issues = decide.error instanceof ApiError ? decide.error.issues : [];
  const issue = (path: string) => fieldError(t, issues?.find((i) => i.path === path)?.message);

  return (
    <Card as="article" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-fg">{t('family.title', { name: request.host.headName })}</h2>
        <span className="text-sm text-fg-muted">
          {placeLabel(request.host.place, request.host.branch, language)} · {t('invite.branch.askedBy', { name: request.requestedByName, date: formatDate(request.requestedAt, language) })}
        </span>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <InvitationCard data={cardFrom(request, request.host.headName, `/api/public/invitations/${request.shareToken}`)} />
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">{t(quiet ? 'invite.branch.noticeHintCondolence' : 'invite.branch.noticeHint')}</p>
          <Input label={t('invite.branch.noticeTitle')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} error={issue('title')} />
          <Textarea label={t('invite.branch.noticeBody')} rows={10} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} error={issue('body')} />
          {decide.isError && !declining && <FormAlert message={errorMessage(decide.error)} />}
          <div className="flex flex-wrap gap-2">
            <Button
              leadingIcon={Megaphone}
              loading={decide.isPending && !declining}
              onClick={() => decide.mutate({ id: request.id, approve: { title, body } }, { onSuccess: () => toast.success(t('invite.branch.posted')) })}
            >
              {t('invite.branch.approve')}
            </Button>
            <Button variant="ghost" className="text-danger" onClick={() => setDeclining(true)}>
              {t('invite.branch.decline')}
            </Button>
          </div>
        </div>
      </div>
      <Modal
        open={declining}
        onClose={() => setDeclining(false)}
        title={t('invite.branch.decline')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={decide.isPending}
              onClick={() => {
                setTried(true);
                if (reason.trim().length < 3) return;
                decide.mutate({ id: request.id, decline: { reason } }, { onSuccess: () => toast.success(t('invite.branch.declinedDone')) });
              }}
            >
              {t('invite.branch.decline')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea
            label={t('invite.branch.reason')}
            hint={t('invite.branch.reasonHint')}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={tried && reason.trim().length < 3 ? fieldError(t, 'validation.declineReason') : undefined}
          />
          {decide.isError && declining && <FormAlert message={errorMessage(decide.error)} />}
        </div>
      </Modal>
    </Card>
  );
}

/** For the committee: families asking to share an invitation with the whole branch. */
export function BranchRequestsPage() {
  const t = useT();
  const requests = useBranchRequests(true);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div>
        <Link to="/invitations" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <Icon icon={ArrowLeft} />
          {t('invite.page.title')}
        </Link>
      </div>
      <PageHeader title={t('invite.branch.requestsTitle')} description={t('invite.branch.requestsBody')} />
      {requests.isPending ? (
        <Skeleton className="h-80 w-full rounded-lg" />
      ) : requests.isError ? (
        <ErrorState title={t('invite.error')} error={requests.error} onRetry={() => requests.refetch()} retrying={requests.isFetching} />
      ) : requests.data.length === 0 ? (
        <EmptyState icon={CircleCheck} title={t('invite.branch.noneTitle')} body={t('invite.branch.noneBody')} />
      ) : (
        requests.data.map((r) => <Request key={r.id} request={r} />)
      )}
    </div>
  );
}
