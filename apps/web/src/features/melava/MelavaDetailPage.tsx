import { type MelavaDetail, type MelavaRegistration, type RegistrationStatus, gotraName } from '@samaj/shared';
import { ArrowLeft, BadgeCheck, Buildings, CalendarDays, Download, Info, MapPin, Pencil, Plus, UsersRound, X } from '@/components/ui/icons';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Avatar, Badge, Button, Card, CardTitle, Chip, ChipRow, EmptyState, ErrorState, Icon, Input, Modal, Select, Skeleton, Textarea, buttonVariants, toast } from '@/components/ui';
import { branchName } from '@/features/branches/api';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useMyMatrimony } from '@/features/matrimony/api';
import { candidateLabel, downloadBooklet, formatMelavaDate, useMelava, useRegisterForMelava, useRegistrationAction } from './api';
import { MelavaFormModal } from './MelavaFormModal';
import { OfficeRegisterModal } from './OfficeRegisterModal';

const STATUS_TONE: Record<RegistrationStatus, 'warning' | 'success' | 'neutral'> = { pendingPayment: 'warning', verified: 'success', cancelled: 'neutral' };

function RegistrationStatusBadge({ r }: { r: MelavaRegistration }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  if (r.status === 'verified' && r.candidateNumber !== null) return <Badge tone="success">{candidateLabel(t, r.candidateType, r.candidateNumber, language)}</Badge>;
  return <Badge tone={STATUS_TONE[r.status]}>{t(`melava.status.${r.status}`)}</Badge>;
}

/** One registration: who, and where it stands. Organisers get verify and cancel. */
function RegistrationRow({ r, melavaId, manage, own }: { r: MelavaRegistration; melavaId: string; manage: boolean; own: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const { verify, cancel } = useRegistrationAction(melavaId);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const onError = (err: unknown) => toast.error(errorMessage(err));
  const kul = gotraName(r.profile.gotra, language);
  const canCancel = r.status !== 'cancelled' && (manage || (own && r.status === 'pendingPayment'));

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <Avatar name={r.profile.name} src={r.profile.photoUrl} size="md" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/matrimony/profiles/${r.profile.id}`} className="truncate font-semibold text-fg hover:underline">
          {r.profile.name}
        </Link>
        <p className="truncate text-sm text-fg-muted">
          {[t(`melava.type.${r.candidateType}`), r.profile.age !== null ? t('matrimony.years', { age: formatNumber(r.profile.age, language) }) : null, kul].filter(Boolean).join(' · ')}
        </p>
        <p className="truncate text-xs text-fg-muted">
          {t('melava.paymentRefShort', { ref: r.paymentRef })}
          {r.cancelReason && ` · ${r.cancelReason}`}
        </p>
      </div>
      <RegistrationStatusBadge r={r} />
      {(manage || canCancel) && (
        <div className="flex gap-2">
          {manage && r.status === 'pendingPayment' && (
            <Button size="sm" leadingIcon={BadgeCheck} loading={verify.isPending} onClick={() => verify.mutate(r.id, { onSuccess: () => toast.success(t('melava.verified')), onError })}>
              {t('melava.verify')}
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" size="sm" leadingIcon={X} onClick={() => setCancelling(true)}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      )}
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={t('melava.cancelTitle', { name: r.profile.name })}
        description={r.status === 'verified' ? t('melava.cancelNumberRetired') : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(false)}>
              {t('common.close')}
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(
                  { registrationId: r.id, reason },
                  {
                    onSuccess: () => {
                      toast.success(t('melava.cancelled'));
                      setCancelling(false);
                    },
                    onError,
                  },
                )
              }
            >
              {t('melava.cancelConfirm')}
            </Button>
          </>
        }
      >
        <Textarea label={t('melava.cancelReason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </li>
  );
}

/** A family registers a complete profile and gives the payment reference. */
function RegisterModal({ melava, open, onClose }: { melava: MelavaDetail; open: boolean; onClose: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const mine = useMyMatrimony();
  const register = useRegisterForMelava(melava.id);
  const taken = new Set(melava.mine.filter((r) => r.status !== 'cancelled').map((r) => r.profile.id));
  const choices = (mine.data?.profiles ?? []).filter((p) => (p.status === 'active' || p.status === 'pending') && !taken.has(p.id));
  const [profileId, setProfileId] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const chosen = profileId || choices[0]?.id || '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('melava.registerTitle')}
      description={t('melava.registerBody', { fee: formatNumber(melava.fee, language) })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!chosen}
            loading={register.isPending}
            onClick={() =>
              register.mutate(
                { profileId: chosen, paymentRef },
                {
                  onSuccess: () => {
                    toast.success(t('melava.registered'));
                    onClose();
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                },
              )
            }
          >
            {t('melava.register')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {melava.paymentInstructions && (
          <Card variant="muted" className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-fg">{t('melava.howToPay')}</p>
            <p className="text-sm whitespace-pre-line text-fg">{melava.paymentInstructions}</p>
          </Card>
        )}
        {choices.length === 0 ? (
          <p className="flex items-start gap-2 text-sm text-fg-muted">
            <Icon icon={Info} size="sm" className="mt-0.5" />
            {t('melava.noEligible')}
          </p>
        ) : (
          <Select label={t('melava.profile')} value={chosen} onChange={(e) => setProfileId(e.target.value)}>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        <Input label={t('melava.paymentRef')} hint={t('melava.paymentRefHint')} value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
        {register.error instanceof ApiError && register.error.issues.some((i) => i.message === 'validation.required') && (
          <p className="text-sm text-danger">{t('melava.incomplete')}</p>
        )}
      </div>
    </Modal>
  );
}

const FILTERS = ['all', 'pendingPayment', 'verified', 'cancelled'] as const;

export function MelavaDetailPage() {
  const { id = '' } = useParams();
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const melava = useMelava(id);
  const [registering, setRegistering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [atOffice, setAtOffice] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [downloading, setDownloading] = useState(false);

  if (melava.isPending) return <Skeleton className="h-64 w-full rounded-md" />;
  if (melava.isError) {
    if (melava.error instanceof ApiError && melava.error.status === 404) {
      return <EmptyState icon={UsersRound} title={t('melava.goneTitle')} body={t('melava.goneBody')} />;
    }
    return <ErrorState title={t('melava.error')} error={melava.error} onRetry={() => melava.refetch()} retrying={melava.isFetching} />;
  }

  const m = melava.data;
  const manage = m.permissions.canManage;
  const all = m.registrations ?? [];
  const shown = filter === 'all' ? all : all.filter((r) => r.status === filter);
  const count = (s: RegistrationStatus) => all.filter((r) => r.status === s).length;
  const download = async (lang: 'mr' | 'en') => {
    setDownloading(true);
    try {
      await downloadBooklet(m.id, lang);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Link to="/matrimony/melavas" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} self-start`}>
        <Icon icon={ArrowLeft} />
        {t('melava.all')}
      </Link>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="font-display text-2xl font-semibold text-fg">{m.name}</h2>
            <p className="flex items-center gap-1.5 text-sm text-fg">
              <Icon icon={CalendarDays} size="sm" className="text-fg-muted" />
              {formatMelavaDate(m.date, language)}
            </p>
            <p className="flex items-center gap-1.5 text-sm text-fg">
              <Icon icon={MapPin} size="sm" className="text-fg-muted" />
              {[m.venue, branchName(m.branch, language)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={m.registrationOpen ? 'success' : 'neutral'}>{m.registrationOpen ? t('melava.open') : t('melava.closed')}</Badge>
            <Badge>{t('melava.feeLine', { fee: formatNumber(m.fee, language) })}</Badge>
          </div>
        </div>
        {m.paymentInstructions && (
          <div className="rounded-sm bg-surface-muted p-3 text-sm">
            <p className="font-semibold text-fg">{t('melava.howToPay')}</p>
            <p className="whitespace-pre-line text-fg">{m.paymentInstructions}</p>
          </div>
        )}
      </Card>

      {/* The family's own registrations. */}
      <Card as="section" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('melava.mine')}</CardTitle>
          {m.registrationOpen && (
            <Button size="sm" leadingIcon={Plus} onClick={() => setRegistering(true)}>
              {t('melava.register')}
            </Button>
          )}
        </div>
        {m.mine.length === 0 ? (
          <p className="text-sm text-fg-muted">{m.registrationOpen ? t('melava.mineEmpty') : t('melava.closedBody')}</p>
        ) : (
          <ul className="-mx-4 -mb-4 border-t border-line">
            {m.mine.map((r) => (
              <RegistrationRow key={r.id} r={r} melavaId={m.id} manage={manage} own />
            ))}
          </ul>
        )}
        <p className="text-xs text-fg-muted">{t('melava.numberNote')}</p>
      </Card>

      {manage && (
        <Card as="section" padding="none" className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-col gap-0.5">
              <CardTitle>{t('melava.registrations')}</CardTitle>
              <p className="text-sm text-fg-muted tabular-nums">
                {t('melava.counts', { brides: formatNumber(m.counts.bride, language), grooms: formatNumber(m.counts.groom, language) })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" leadingIcon={Buildings} onClick={() => setAtOffice(true)}>
                {t('melava.office.open')}
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={Pencil} onClick={() => setEditing(true)}>
                {t('common.edit')}
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={Download} loading={downloading} onClick={() => download('mr')}>
                {t('melava.downloadMr')}
              </Button>
              <Button variant="ghost" size="sm" leadingIcon={Download} disabled={downloading} onClick={() => download('en')}>
                {t('melava.downloadEn')}
              </Button>
            </div>
          </div>
          <div className="px-4 pb-3">
            <ChipRow label={t('melava.registrations')}>
              {FILTERS.map((f) => (
                <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? t('melava.filter.all', { n: formatNumber(all.length, language) }) : `${t(`melava.status.${f}`)} (${formatNumber(count(f), language)})`}
                </Chip>
              ))}
            </ChipRow>
          </div>
          {shown.length === 0 ? (
            <p className="border-t border-line p-4 text-sm text-fg-muted">{t('melava.noneHere')}</p>
          ) : (
            <ul className="border-t border-line">
              {shown.map((r) => (
                <RegistrationRow key={r.id} r={r} melavaId={m.id} manage own={m.mine.some((x) => x.id === r.id)} />
              ))}
            </ul>
          )}
        </Card>
      )}

      <RegisterModal melava={m} open={registering} onClose={() => setRegistering(false)} />
      {manage && <MelavaFormModal open={editing} melava={m} onClose={() => setEditing(false)} />}
      {manage && <OfficeRegisterModal melava={m} open={atOffice} onClose={() => setAtOffice(false)} />}
    </div>
  );
}
