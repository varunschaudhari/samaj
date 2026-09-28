import { LANGUAGES, type Language, type LinkReplyReceipt } from '@samaj/shared';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { BrandMark } from '@/components/layout/BrandMark';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { Button, Card, EmptyState, ErrorState, Input, Skeleton, toast } from '@/components/ui';
import { CircleCheck, SearchX } from '@/components/ui/icons';
import { FormAlert } from '@/features/auth/FormAlert';
import { fieldError } from '@/features/auth/form-errors';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { AnswerRows, answerLabels, answersReady, answersToInput, startAnswers } from './AnswerRows';
import { useLinkReply, usePublicInvitation } from './api';
import { InvitationCard } from './InvitationCard';
import { cardFrom, isRemembrance } from './kinds';
import { PatrikaShown } from './Patrika';

/** The reply this phone sent, kept so it can be changed rather than sent twice. */
const storageKey = (token: string) => `samaj.inviteReply.${token}`;
function readReceipt(token: string): LinkReplyReceipt | null {
  try {
    const raw = localStorage.getItem(storageKey(token));
    return raw ? (JSON.parse(raw) as LinkReplyReceipt) : null;
  } catch {
    return null;
  }
}
function saveReceipt(token: string, receipt: LinkReplyReceipt) {
  try {
    localStorage.setItem(storageKey(token), JSON.stringify(receipt));
  } catch {
    // Private browsing: the reply is sent, it just can't be changed from this phone later.
  }
}

/**
 * An invitation opened from its link, by anyone: relatives outside the samaj,
 * elders who don't use the app. The card, and a reply with a name and a
 * headcount per function. No sign-in, nothing about the other guests.
 */
export function PublicInvitationPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const t = useT();
  const errorMessage = useErrorMessage();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const invitation = usePublicInvitation(token);
  const reply = useLinkReply(token);
  const [receipt, setReceipt] = useState(() => readReceipt(token));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(receipt?.name ?? '');
  const [place, setPlace] = useState(receipt?.place ?? '');
  const [answers, setAnswers] = useState(startAnswers([]));
  const [tried, setTried] = useState(false);

  // The link carries the language it was shared in.
  useEffect(() => {
    const lang = params.get('lang');
    if (lang && LANGUAGES.includes(lang as Language)) setLanguage(lang as Language);
  }, [params, setLanguage]);
  useEffect(() => {
    if (invitation.data) setAnswers(startAnswers(invitation.data.functions, receipt?.answers));
  }, [invitation.data, receipt]);

  const header = (
    <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3 sm:px-6">
      <BrandMark />
      <LanguageSwitch />
    </header>
  );
  const wrap = (body: React.ReactNode) => (
    <div className="min-h-dvh bg-canvas">
      {header}
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">{body}</main>
    </div>
  );

  if (invitation.isPending) return wrap(<Skeleton className="h-96 w-full rounded-lg" />);
  if (invitation.isError) {
    return wrap(
      invitation.error instanceof ApiError && invitation.error.status === 404 ? (
        <EmptyState icon={SearchX} title={t('invite.public.goneTitle')} body={t('invite.public.goneBody')} />
      ) : (
        <ErrorState title={t('invite.error')} error={invitation.error} onRetry={() => invitation.refetch()} retrying={invitation.isFetching} />
      ),
    );
  }

  const inv = invitation.data;
  const quiet = isRemembrance(inv.kind);
  const labels = answerLabels(inv.kind);
  const nameError = tried && name.trim().length < 2 ? fieldError(t, 'validation.replyName') : undefined;
  const send = () => {
    setTried(true);
    if (name.trim().length < 2 || !answersReady(answers)) return;
    reply.mutate(
      { name, place, answers: answersToInput(answers), ...(receipt && { key: receipt.key }) },
      {
        onSuccess: (r) => {
          saveReceipt(token, r);
          setReceipt(r);
          setEditing(false);
          toast.success(t('invite.public.sent'));
        },
      },
    );
  };

  return wrap(
    <>
      <InvitationCard cancelled={inv.cancelled} data={cardFrom(inv, inv.hostName, `/api/public/invitations/${token}`)} />
      {inv.patrika && <PatrikaShown patrika={inv.patrika} src={`/api/public/invitations/${token}/patrika`} />}
      {inv.closed ? (
        <p className="text-center text-sm text-fg-muted">{inv.cancelled ? t('invite.rsvp.cancelled') : t('invite.rsvp.closed')}</p>
      ) : receipt && !editing ? (
        <Card as="section" aria-labelledby="sent" className="flex flex-col gap-3">
          <h2 id="sent" className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
            <CircleCheck className="size-6 text-success" weight="duotone" />
            {t('invite.public.thanks', { name: receipt.name })}
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-fg">
            {inv.functions.map((f) => {
              const a = receipt.answers.find((x) => x.functionId === f.id);
              return a ? (
                <li key={f.id}>
                  <span className="font-semibold">{f.name}:</span> {t(labels[a.answer])}
                  {a.answer !== 'no' && ` · ${t('invite.host.people', { count: formatNumber(a.people, language) })}`}
                </li>
              ) : null;
            })}
          </ul>
          <Button variant="secondary" size="sm" className="self-start" onClick={() => setEditing(true)}>
            {t('invite.public.change')}
          </Button>
        </Card>
      ) : (
        <Card as="section" aria-labelledby="reply" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="reply" className="font-display text-lg font-semibold text-fg">
              {t(quiet ? 'invite.rsvp.titleRemembrance' : 'invite.public.title')}
            </h2>
            <p className="text-sm text-fg-muted">{t('invite.public.hint', { name: inv.hostName })}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t('invite.public.name')} hint={t('invite.public.nameHint')} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={nameError} maxLength={80} />
            <Input label={t('invite.public.place')} labelSuffix={t('common.optional')} value={place} onChange={(e) => setPlace(e.target.value)} maxLength={60} />
          </div>
          <AnswerRows kind={inv.kind} functions={inv.functions} answers={answers} onChange={setAnswers} />
          {tried && !answersReady(answers) && <p className="text-sm text-danger">{t('invite.public.answerEach')}</p>}
          {reply.isError && <FormAlert message={errorMessage(reply.error)} />}
          <Button className="self-start" loading={reply.isPending} onClick={send}>
            {t('invite.rsvp.save')}
          </Button>
        </Card>
      )}
      <p className="text-center text-sm text-fg-muted">
        {t('invite.public.member')}{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          {t('invite.public.signIn')}
        </Link>
      </p>
    </>,
  );
}
