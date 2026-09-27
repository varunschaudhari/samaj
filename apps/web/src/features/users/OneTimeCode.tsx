import { formatResetCode } from '@samaj/shared';
import { Check, Copy, KeyRound } from '@/components/ui/icons';
import { useEffect, useState } from 'react';
import { Button, Icon, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';

/** A reset or invite code, large enough to read out over the phone, with a copy button. */
export function OneTimeCode({ code, expiry }: { code: string; expiry: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const formatted = formatResetCode(code);
  useEffect(() => setCopied(false), [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable; the code stays on screen to read or type.
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <Icon icon={KeyRound} size="lg" className="text-primary" />
      <p className="rounded-md bg-surface-muted px-5 py-3 font-mono text-3xl font-semibold tracking-widest text-fg tabular-nums select-all" lang="en">
        {formatted}
      </p>
      <p className="text-center text-sm text-fg-muted">{expiry}</p>
      <Button variant="secondary" size="sm" leadingIcon={copied ? Check : Copy} onClick={copy}>
        {copied ? t('reset.copied') : t('reset.copy')}
      </Button>
    </div>
  );
}

export function OneTimeCodeSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 py-4" aria-busy="true">
      <Skeleton className="h-14 w-60 rounded-md" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}
