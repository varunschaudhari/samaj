import { describe, expect, it } from 'vitest';
import { calendarFile } from './calendar';

describe('the calendar file', () => {
  const file = calendarFile({
    title: 'शुभविवाह: रोहित आणि काव्या',
    hostLine: 'Anil Wagh; Amalner, Jalgaon',
    link: 'https://samaj.example/i/abc',
    functions: [
      { id: 'f1', name: 'हळद', startsAt: '2026-12-11T11:30:00.000Z', endsAt: null, venue: 'Wagh Wadi, Jalgaon' },
      { id: 'f2', name: 'लग्न', startsAt: '2026-12-12T06:00:00.000Z', endsAt: '2026-12-12T09:00:00.000Z', venue: 'Samaj hall' },
    ],
  });
  const unfolded = file.replace(/\r\n /g, '');

  it('has one event per function, in UTC, two hours long when no end was given', () => {
    expect(file.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(unfolded).toContain('DTSTART:20261211T113000Z\r\nDTEND:20261211T133000Z');
    expect(unfolded).toContain('DTSTART:20261212T060000Z\r\nDTEND:20261212T090000Z');
    expect(unfolded).toContain('TRIGGER:-PT3H');
  });

  it('escapes commas and semicolons, and folds long lines by bytes', () => {
    expect(unfolded).toContain(String.raw`LOCATION:Wagh Wadi\, Jalgaon`);
    expect(unfolded).toContain(String.raw`DESCRIPTION:Anil Wagh\; Amalner\, Jalgaon\nhttps://samaj.example/i/abc`);
    for (const line of file.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfolded).toContain('SUMMARY:हळद · शुभविवाह: रोहित आणि काव्या');
  });
});
