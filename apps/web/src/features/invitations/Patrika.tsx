import { PATRIKA_MAX_BYTES, PATRIKA_TYPES, type PatrikaView } from '@samaj/shared';
import { useRef } from 'react';
import { Button, Card, Icon, buttonVariants, toast } from '@/components/ui';
import { ExternalLink, Trash2, Upload } from '@/components/ui/icons';
import { FormAlert } from '@/features/auth/FormAlert';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useRemovePatrika, useSetPatrika } from './api';

/** The family's own printed patrika: the picture itself, or a button to open the PDF. */
export function PatrikaShown({ patrika, src }: { patrika: PatrikaView; src: string }) {
  const t = useT();
  const url = `${src}?v=${patrika.version}`;
  if (patrika.kind === 'pdf') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: 'secondary' })} self-center`}>
        <Icon icon={ExternalLink} />
        {t('invite.patrika.openPdf')}
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line bg-surface shadow-card" aria-label={t('invite.patrika.openImage')}>
      <img src={url} alt={t('invite.patrika.alt')} className="mx-auto max-h-[80vh] w-auto" loading="lazy" />
    </a>
  );
}

/** The host adds the printed patrika (a photo of it or its PDF), replaces or removes it. */
export function PatrikaEditor({ invitationId, patrika }: { invitationId: string; patrika: PatrikaView | null }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const input = useRef<HTMLInputElement>(null);
  const upload = useSetPatrika(invitationId);
  const remove = useRemovePatrika(invitationId);
  const tooBig = t('validation.patrikaSize');

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > PATRIKA_MAX_BYTES) {
      toast.error(tooBig);
      return;
    }
    upload.mutate(file, { onSuccess: () => toast.success(t('invite.patrika.added')) });
  };

  return (
    <Card as="section" aria-labelledby="patrika" className="flex flex-col gap-3 print:hidden">
      <div className="flex flex-col gap-1">
        <h2 id="patrika" className="font-display text-lg font-semibold text-fg">
          {t('invite.patrika.title')}
        </h2>
        <p className="text-sm text-fg-muted">{t('invite.patrika.hint', { size: formatNumber(PATRIKA_MAX_BYTES / 1024 / 1024, language) })}</p>
      </div>
      {(upload.isError || remove.isError) && <FormAlert message={errorMessage(upload.error ?? remove.error)} />}
      <input ref={input} type="file" accept={PATRIKA_TYPES.join(',')} className="hidden" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" leadingIcon={Upload} loading={upload.isPending} onClick={() => input.current?.click()}>
          {patrika ? t('invite.patrika.replace') : t('invite.patrika.add')}
        </Button>
        {patrika && (
          <Button variant="ghost" size="sm" leadingIcon={Trash2} className="text-danger" loading={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success(t('invite.patrika.removed')) })}>
            {t('invite.patrika.remove')}
          </Button>
        )}
      </div>
    </Card>
  );
}
