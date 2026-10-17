import type { MelavaDetail, OfficeCandidate } from '@samaj/shared';
import { BadgeCheck, NotePencil, Plus, Search, UserPlus } from '@/components/ui/icons';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Badge, Button, ErrorState, Icon, Input, Modal, Skeleton, buttonVariants, toast } from '@/components/ui';
import { EnrolFamilyModal } from '@/features/families/EnrolFamilyModal';
import { type ProfileFormTarget, ProfileFormModal } from '@/features/matrimony/ProfileFormModal';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { candidateLabel, useOfficeRegister, useOfficeSearch } from './api';

/** Register now: fee taken at the counter (number given at once), or to be paid later. */
function RegisterNow({ melavaId, candidate, onDone }: { melavaId: string; candidate: OfficeCandidate; onDone: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const register = useOfficeRegister(melavaId);
  const [paid, setPaid] = useState(true);
  const [paymentRef, setPaymentRef] = useState('');
  if (!candidate.profile) return null;
  const profileId = candidate.profile.id;

  return (
    <div className="flex flex-col gap-3 rounded-sm bg-surface-muted p-3">
      <label className="flex min-h-touch cursor-pointer items-center gap-3 text-sm text-fg">
        <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
        {t('melava.office.paidNow')}
      </label>
      <Input label={t('melava.office.receipt')} labelSuffix={t('common.optional')} value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
      <Button
        leadingIcon={BadgeCheck}
        className="self-start"
        loading={register.isPending}
        onClick={() =>
          register.mutate(
            { profileId, paid, paymentRef },
            {
              onSuccess: (melava) => {
                const reg = melava.registrations?.find((r) => r.profile.id === profileId);
                toast.success(reg?.candidateNumber ? t('melava.office.doneNumber', { name: candidate.name, number: reg.candidateNumber }) : t('melava.office.done', { name: candidate.name }));
                onDone();
              },
              onError: (err) => toast.error(errorMessage(err)),
            },
          )
        }
      >
        {paid ? t('melava.office.registerPaid') : t('melava.office.registerUnpaid')}
      </Button>
    </div>
  );
}

function CandidateRow({ melava, candidate, onCreateProfile, onChanged }: { melava: MelavaDetail; candidate: OfficeCandidate; onCreateProfile: () => void; onChanged: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const [open, setOpen] = useState(false);
  const { profile, registration } = candidate;
  const registered = registration && registration.status !== 'cancelled';
  const ready = profile && profile.missing.length === 0 && ['draft', 'pending', 'active'].includes(profile.status);

  let action;
  if (registered) {
    action =
      registration.status === 'verified' && registration.candidateNumber !== null ? (
        <Badge tone="success">{candidateLabel(t, candidate.gender === 'female' ? 'bride' : 'groom', registration.candidateNumber, language)}</Badge>
      ) : (
        <Badge tone="warning">{t('melava.status.pendingPayment')}</Badge>
      );
  } else if (!profile) {
    action = (
      <Button size="sm" variant="secondary" leadingIcon={Plus} onClick={onCreateProfile}>
        {t('melava.office.createProfile')}
      </Button>
    );
  } else if (!ready) {
    action = (
      <Link to={`/matrimony/profiles/${profile.id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        <Icon icon={NotePencil} />
        {profile.missing.length ? t('melava.office.complete', { n: formatNumber(profile.missing.length, language) }) : t('melava.office.openProfile')}
      </Link>
    );
  } else {
    action = (
      <Button size="sm" variant={open ? 'ghost' : 'primary'} onClick={() => setOpen((o) => !o)}>
        {open ? t('common.cancel') : t('melava.register')}
      </Button>
    );
  }

  return (
    <li className="flex flex-col gap-3 border-b border-line py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <Avatar name={candidate.name} size="md" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-semibold text-fg">{candidate.name}</p>
          <p className="truncate text-sm text-fg-muted">
            {[
              candidate.age !== null ? t('matrimony.years', { age: formatNumber(candidate.age, language) }) : null,
              candidate.place,
              candidate.familyHead && candidate.familyHead !== candidate.name ? t('directory.familyHead', { name: candidate.familyHead }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {open && ready && !registered && (
        <RegisterNow
          melavaId={melava.id}
          candidate={candidate}
          onDone={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}
    </li>
  );
}

/**
 * The melava counter: find a walk-in family, create or complete the
 * son's or daughter's profile, and register it, with the number given at
 * once when the fee is paid there. For families not in the app yet, enrol
 * them first.
 */
export function OfficeRegisterModal({ melava, open, onClose }: { melava: MelavaDetail; open: boolean; onClose: () => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const query = useDebouncedValue(q.trim());
  const search = useOfficeSearch(melava.id, query);
  const [creating, setCreating] = useState<ProfileFormTarget | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  let results;
  if (query.length < 2) {
    results = <p className="py-4 text-sm text-fg-muted">{t('melava.office.hint')}</p>;
  } else if (search.isPending) {
    results = (
      <div className="flex flex-col gap-3 py-3" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-sm" />
        ))}
      </div>
    );
  } else if (search.isError) {
    results = <ErrorState title={t('melava.error')} error={search.error} onRetry={() => search.refetch()} retrying={search.isFetching} />;
  } else if (search.data.length === 0) {
    results = <p className="py-4 text-sm text-fg-muted">{t('melava.office.none')}</p>;
  } else {
    results = (
      <ul className="flex flex-col">
        {search.data.map((c) => (
          <CandidateRow
            key={c.memberId}
            melava={melava}
            candidate={c}
            onChanged={() => void search.refetch()}
            onCreateProfile={() =>
              setCreating({ mode: 'create', eligible: [{ memberId: c.memberId, name: c.name, gender: c.gender, age: c.age ?? 0 }], contact: c.suggestedContact })
            }
          />
        ))}
      </ul>
    );
  }

  return (
    <>
      <Modal
        open={open && creating === null && !enrolling}
        onClose={onClose}
        title={t('melava.office.title')}
        description={t('melava.office.body')}
        footer={<Button onClick={onClose}>{t('common.close')}</Button>}
        className="md:max-w-2xl"
      >
        <div className="flex flex-col gap-2">
          <Input label={t('melava.office.search')} hideLabel placeholder={t('melava.office.searchPlaceholder')} leadingIcon={Search} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {results}
          <div className={cn('flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm text-fg-muted')}>
            {t('melava.office.notListed')}
            <Button size="sm" variant="ghost" leadingIcon={UserPlus} onClick={() => setEnrolling(true)}>
              {t('enrol.open')}
            </Button>
          </div>
        </div>
      </Modal>
      <ProfileFormModal target={creating} onClose={() => setCreating(null)} onCreated={() => void search.refetch()} />
      <EnrolFamilyModal open={enrolling} onClose={() => setEnrolling(false)} />
    </>
  );
}
