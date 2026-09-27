import type { UseFormRegisterReturn } from 'react-hook-form';
import { Link } from 'react-router';
import { Checkbox } from '@/components/ui';
import { type MessageKey, useT } from '@/i18n';

/** "I agree to the privacy notice", with the notice a tap away in a new tab so the form isn't lost. */
export function ConsentField({ label, register, error }: { label: MessageKey; register: UseFormRegisterReturn; error?: string | undefined }) {
  const t = useT();
  return (
    <Checkbox
      label={t(label)}
      hint={
        <Link to="/privacy" target="_blank" rel="noopener" className="font-semibold text-primary underline-offset-2 hover:underline">
          {t('privacy.readNotice')}
        </Link>
      }
      error={error}
      {...register}
    />
  );
}
