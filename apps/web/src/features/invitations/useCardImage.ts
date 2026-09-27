import type { InvitationFunction, InvitationKind } from '@samaj/shared';
import { useState } from 'react';
import { toast } from '@/components/ui';
import { formatEventTime } from '@/features/community/events-api';
import { useLanguageStore, useT } from '@/i18n';
import { drawCardImage, shareOrDownload } from './cardImage';
import { isRemembrance } from './kinds';

interface CardSource {
  kind: InvitationKind;
  forNames: string | null;
  message: string | null;
  hostName: string;
  functions: InvitationFunction[];
}

/** Makes the card picture in the current language and shares or downloads it. */
export function useCardImage(card: CardSource, link: string) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const [busy, setBusy] = useState(false);
  const quiet = isRemembrance(card.kind);
  const kind = t(`invite.kind.${card.kind}`);

  const make = async () => {
    setBusy(true);
    try {
      const blob = await drawCardImage({
        top: quiet ? t('invite.card.inMemory') : t('invite.card.ganesh'),
        kind,
        forNames: card.forNames,
        invites: quiet ? t('invite.card.remembranceInvite', { name: card.hostName }) : t('invite.card.invitesYou', { name: card.hostName }),
        functions: card.functions.map((f) => ({ name: f.name, when: formatEventTime(f.startsAt, f.endsAt, language), venue: f.venue })),
        message: card.message,
        footer: t('invite.image.footer', { link }),
        quiet,
      });
      const how = await shareOrDownload(blob, `${kind}${card.forNames ? ` - ${card.forNames}` : ''}.png`.replace(/[\/:*?"<>|]/g, ''), `${kind}${card.forNames ? `: ${card.forNames}` : ''}\n${link}`);
      if (how === 'downloaded') toast.success(t('invite.image.saved'));
    } catch {
      toast.error(t('invite.image.failed'));
    } finally {
      setBusy(false);
    }
  };
  return { make, busy };
}
