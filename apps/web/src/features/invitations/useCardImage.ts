import { type InvitationFunction, type InvitationKind, type InvitationTheme, type PatrikaText, themeFor } from '@samaj/shared';
import { useState } from 'react';
import { toast } from '@/components/ui';
import { formatEventTime } from '@/features/community/events-api';
import { useLanguageStore, useT } from '@/i18n';
import { drawCardImage, shareOrDownload } from './cardImage';
import { isRemembrance, muhuratText } from './kinds';

interface CardSource extends Omit<PatrikaText, 'memorial'> {
  kind: InvitationKind;
  forNames: string | null;
  message: string | null;
  hostName: string;
  functions: InvitationFunction[];
  theme?: InvitationTheme | null;
  addressee?: string | null;
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
        honorees: card.honorees,
        with: t('invite.card.with'),
        invites: quiet ? t('invite.card.remembranceInvite', { name: card.hostName }) : t('invite.card.invitesYou', { name: card.hostName }),
        functions: card.functions.map((f) => ({
          name: f.name,
          when: formatEventTime(f.startsAt, f.endsAt, language),
          venue: f.venue,
          muhurat: f.muhuratAt ? t('invite.card.muhurat', { time: muhuratText(f.muhuratAt, f.startsAt, language) }) : null,
        })),
        message: card.message,
        lists: [
          { label: t('invite.card.kripa'), names: card.kripa },
          { label: t('invite.card.blessings'), names: card.blessings },
          { label: t(quiet ? 'invite.card.grieving' : 'invite.card.inviters'), names: card.inviters },
        ],
        footer: t('invite.image.footer', { link }),
        theme: themeFor(card.kind, card.theme),
        addressee: card.addressee ? t('invite.card.dear', { name: card.addressee }) : null,
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
