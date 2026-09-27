import { useState } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/layout/BrandMark';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { Button, Card, Checkbox, Icon, toast } from '@/components/ui';
import { ExternalLink, LogOut, ShieldCheck, Trash2 } from '@/components/ui/icons';
import { useLogout } from '@/features/auth/api';
import { useErrorMessage, useT } from '@/i18n';
import { useConsent, usePrivacyStatus } from './api';
import { DeleteDataModal } from './PrivacyControls';

const POINTS = ['privacy.consent.point1', 'privacy.consent.point2', 'privacy.consent.point3', 'privacy.consent.point4'] as const;

/**
 * Shown instead of the app until the signed-in person agrees to the current
 * privacy notice. They can read it, agree, sign out, or delete their data.
 */
export function ConsentScreen() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const consent = useConsent();
  const logout = useLogout();
  const [agreed, setAgreed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status = usePrivacyStatus();
  // Declining means deleting: the person alone, or (a head who is the only account) the family.
  const scope = status.data?.canDeleteSelf ? 'self' : status.data?.canDeleteFamily ? 'family' : null;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <BrandMark />
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-8">
        <div className="flex flex-col gap-2">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon icon={ShieldCheck} size="lg" weight="duotone" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-fg">{t('privacy.consent.title')}</h1>
          <p className="text-fg-muted">{t('privacy.consent.body')}</p>
        </div>
        <Card className="flex flex-col gap-3">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-fg marker:text-primary">
            {POINTS.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
          <Link to="/privacy" target="_blank" rel="noopener" className="flex min-h-touch items-center gap-1.5 self-start text-sm font-semibold text-primary hover:underline">
            {t('privacy.readNotice')}
            <Icon icon={ExternalLink} size="sm" />
          </Link>
        </Card>
        <Checkbox label={t('privacy.consent.agree')} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <Button
          size="lg"
          fullWidth
          disabled={!agreed}
          loading={consent.isPending}
          onClick={() => consent.mutate(undefined, { onError: (err) => toast.error(errorMessage(err)) })}
        >
          {t('privacy.consent.continue')}
        </Button>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="ghost" size="sm" leadingIcon={LogOut} loading={logout.isPending} onClick={() => logout.mutate()}>
            {t('auth.logout')}
          </Button>
          {scope && (
            <Button variant="ghost" size="sm" leadingIcon={Trash2} onClick={() => setDeleting(true)} className="text-danger">
              {t('privacy.consent.decline')}
            </Button>
          )}
        </div>
      </main>
      <DeleteDataModal scope={deleting ? scope : null} onClose={() => setDeleting(false)} />
    </div>
  );
}
