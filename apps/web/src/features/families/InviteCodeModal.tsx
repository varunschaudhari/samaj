import { type FamilyMember, formatPhone } from '@samaj/shared';
import { Phone } from '@/components/ui/icons';
import { useEffect } from 'react';
import { Button, ErrorState, Modal } from '@/components/ui';
import { formatDate, useLanguageStore, useT } from '@/i18n';
import { OneTimeCode, OneTimeCodeSkeleton } from '@/features/users/OneTimeCode';
import { useCreateInvite } from './api';

interface InviteCodeModalProps {
  familyId: string;
  /** The person to invite, or null when closed. */
  member: FamilyMember | null;
  onClose: () => void;
  /** Open the member form so a mobile number can be added first. */
  onAddPhone: (member: FamilyMember) => void;
}

/**
 * Gives someone listed in the family their own sign-in. The code is created
 * as soon as this opens, and the person's number on the family record is the
 * one they sign in with, so a number is needed first.
 */
export function InviteCodeModal({ familyId, member, onClose, onAddPhone }: InviteCodeModalProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const create = useCreateInvite(familyId);
  const phone = member?.phone ?? null;

  useEffect(() => {
    if (member && phone) create.mutate(member.id);
    else create.reset();
    // Once per opening, for this person.
  }, [member?.id]);

  const footer = phone ? (
    <Button onClick={onClose}>{t('common.close')}</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button leadingIcon={Phone} onClick={() => member && onAddPhone(member)}>
        {t('invite.addPhone')}
      </Button>
    </>
  );

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title={member ? t('invite.title', { name: member.name }) : ''}
      description={phone ? t('invite.body', { phone: formatPhone(phone) }) : t('invite.needsPhone', { name: member?.name ?? '' })}
      footer={footer}
    >
      {phone && create.isPending && <OneTimeCodeSkeleton />}
      {phone && create.isError && <ErrorState title={t('invite.failed')} error={create.error} onRetry={() => member && create.mutate(member.id)} />}
      {phone && create.data && <OneTimeCode code={create.data.code} expiry={t('invite.expires', { date: formatDate(create.data.expiresAt, language) })} />}
    </Modal>
  );
}
