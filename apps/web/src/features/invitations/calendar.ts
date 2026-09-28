/*
 * An invitation's functions as a calendar file (.ics): opening it on a phone
 * adds each function to the calendar there, with its place and a reminder.
 */

export interface CalendarSource {
  title: string;
  hostLine: string;
  link: string;
  functions: { id: string; name: string; startsAt: string; endsAt: string | null; venue: string }[];
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Text values escape backslashes, commas, semicolons and newlines. */
const text = (v: string) => v.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
/** Lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > 73) {
      out.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

/** Functions without an end are given two hours. */
const TWO_HOURS = 2 * 60 * 60 * 1000;

export function calendarFile(src: CalendarSource): string {
  const now = stamp(new Date().toISOString());
  const events = src.functions.flatMap((f) => [
    'BEGIN:VEVENT',
    `UID:${f.id}@samaj`,
    `DTSTAMP:${now}`,
    `DTSTART:${stamp(f.startsAt)}`,
    `DTEND:${stamp(f.endsAt ?? new Date(new Date(f.startsAt).getTime() + TWO_HOURS).toISOString())}`,
    `SUMMARY:${text(`${f.name} · ${src.title}`)}`,
    `LOCATION:${text(f.venue)}`,
    `DESCRIPTION:${text(`${src.hostLine}\n${src.link}`)}`,
    // A reminder three hours before.
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(f.name)}`,
    'TRIGGER:-PT3H',
    'END:VALARM',
    'END:VEVENT',
  ]);
  return [...['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Samaj//Invitations//EN', 'CALSCALE:GREGORIAN'], ...events, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}

export function downloadCalendar(src: CalendarSource, filename: string) {
  const url = URL.createObjectURL(new Blob([calendarFile(src)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename.replace(/[\\/:*?"<>|]/g, '')}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
