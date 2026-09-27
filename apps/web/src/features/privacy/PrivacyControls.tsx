import { DELETION_GRACE_DAYS, PHONE_VISIBILITIES, type DeletionScope, type PhoneVisibility } from '@samaj/shared';
import { useEffect, useState } from 'react';
import { Button, Checkbox, Modal, toast } from '@/components/ui';
import { Trash2 } from '@/components/ui/icons';
import { PasswordInput } from '@/features/auth/PasswordInput';
import { useErrorMessage, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRequestDeletion, useSetMemberPrivacy } from './api';

/** Who sees the phone number, and whether the person is in the directory. */
export function PrivacyFields({
  phoneVisibility,
  listed,
  onChange,
  forSelf,
}: {
  phoneVisibility: PhoneVisibility;
  listed: boolean;
  onChange: (next: { phoneVisibility: PhoneVisibility; listed: boolean }) => void;
  forSelf: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-fg">{forSelf ? t('privacy.phoneWhoSelf') : t('privacy.phoneWho')}</legend>
        {PHONE_VISIBILITIES.map((v) => (
          <label
            key={v}
            className={cn(
              'flex min-h-touch cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-150',
              phoneVisibility === v ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <input type="radio" name="phoneVisibility" value={v} checked={phoneVisibility === v} onChange={() => onChange({ phoneVisibility: v, listed })} className="mt-1 size-4 accent-primary" />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-fg">{t(`privacy.phone.${v}`)}</span>
              <span className="text-xs text-fg-muted">{t(`privacy.phone.${v}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Checkbox
        label={forSelf ? t('privacy.listedSelf') : t('privacy.listed')}
        hint={t('privacy.listedHint')}
        checked={listed}
        onChange={(e) => onChange({ phoneVisibility, listed: e.target.checked })}
      />
    </div>
  );
}

/** Family page: privacy for one person, set by them (if they have an account) or their family. */
export function MemberPrivacyModal({
  member,
  isSelf,
  onClose,
}: {
  member: { id: string; name: string; privacy?: { phoneVisibility: PhoneVisibility; listed: boolean } } | null;
  isSelf: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const save = useSetMemberPrivacy();
  const [value, setValue] = useState({ phoneVisibility: 'committee' as PhoneVisibility, listed: true });
  useEffect(() => {
    if (member) setValue({ phoneVisibility: member.privacy?.phoneVisibility ?? 'committee', listed: member.privacy?.listed ?? true });
  }, [member?.id]);

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title={member ? (isSelf ? t('privacy.yourSettings') : t('privacy.settingsFor', { name: member.name })) : ''}
      description={t('privacy.settingsBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            onClick={() =>
              member &&
              save.mutate(
                { memberId: member.id, input: value },
                {
                  onSuccess: () => {
                    toast.success(t('privacy.saved'));
                    onClose();
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                },
              )
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <PrivacyFields {...value} onChange={setValue} forSelf={isSelf} />
    </Modal>
  );
}

/** Ask for a deletion: which scope, the password again, and a clear warning. */
export function DeleteDataModal({ scope, onClose }: { scope: DeletionScope | null; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const request = useRequestDeletion();
  const [password, setPassword] = useState('');
  const [sure, setSure] = useState(false);
  useEffect(() => {
    setPassword('');
    setSure(false);
    request.reset();
  }, [scope]);
  const fieldError = request.error instanceof ApiError ? request.error.issues.find((i) => i.path === 'password') : undefined;

  return (
    <Modal
      open={scope !== null}
      onClose={onClose}
      title={scope === 'family' ? t('privacy.deleteFamilyTitle') : t('privacy.deleteSelfTitle')}
      description={t('privacy.deleteBody', { days: DELETION_GRACE_DAYS })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            leadingIcon={Trash2}
            disabled={!sure || !password}
            loading={request.isPending}
            onClick={() =>
              scope &&
              request.mutate(
                { scope, password },
                {
                  onSuccess: () => {
                    toast.success(t('privacy.deleteScheduled', { days: DELETION_GRACE_DAYS }));
                    onClose();
                  },
                  onError: (err) => {
                    if (!(err instanceof ApiError && err.issues.some((i) => i.path === 'password'))) toast.error(errorMessage(err));
                  },
                },
              )
            }
          >
            {t('privacy.deleteConfirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg">
          {(scope === 'family'
            ? (['privacy.deleteFamily.1', 'privacy.deleteFamily.2', 'privacy.deleteFamily.3'] as const)
            : (['privacy.deleteSelf.1', 'privacy.deleteSelf.2', 'privacy.deleteSelf.3'] as const)
          ).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
        <PasswordInput
          label={t('privacy.passwordAgain')}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError ? t('validation.passwordWrong') : undefined}
        />
        <Checkbox label={t('privacy.deleteSure')} checked={sure} onChange={(e) => setSure(e.target.checked)} />
      </div>
    </Modal>
  );
}
