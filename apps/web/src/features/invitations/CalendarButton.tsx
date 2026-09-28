import type { InvitationFunction, InvitationKind } from '@samaj/shared';
import { Button } from '@/components/ui';
import { CalendarPlus } from '@/components/ui/icons';
import { useT } from '@/i18n';
import { downloadCalendar } from './calendar';

/** Adds every function to the phone's calendar, with a reminder three hours before. */
export function CalendarButton({ kind, forNames, hostName, functions, link }: { kind: InvitationKind; forNames: string | null; hostName: string; functions: InvitationFunction[]; link: string }) {
  const t = useT();
  const title = `${t(`invite.kind.${kind}`)}${forNames ? `: ${forNames}` : ''}`;
  return (
    <Button variant="ghost" size="sm" leadingIcon={CalendarPlus} className="print:hidden" onClick={() => downloadCalendar({ title, hostLine: t('invite.from', { name: hostName }), link, functions }, title)}>
      {t('invite.calendar')}
    </Button>
  );
}
