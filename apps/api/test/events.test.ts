import type { EventDetail, EventSummary } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EventModel } from '../src/models/event.model';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

let branches: Awaited<ReturnType<typeof seedBranches>>;
let committee: string;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  committee = (await createFamily(branches.district, { account: 'committee', people: [{ name: 'District Secretary' }] })).cookie;
});

const event = (branchId: string, extra: Record<string, unknown> = {}) => ({
  title: 'Annual gathering',
  description: 'Lunch is arranged.',
  startsAt: inDays(10),
  venue: 'Samaj hall, Amalner',
  mapUrl: 'https://maps.google.com/?q=Amalner',
  branchId,
  ...extra,
});

const list = async (cookie: string, when = 'upcoming') => ((await api.get(`/api/events?when=${when}`).set('Cookie', cookie)).body.items as EventSummary[]).map((e) => e.title);

describe('events', () => {
  it('reach the branch and every town under it, sorted soonest first', async () => {
    await api.post('/api/events').set('Cookie', committee).send(event(branches.district, { title: 'Later', startsAt: inDays(20) }));
    await api.post('/api/events').set('Cookie', committee).send(event(branches.district, { title: 'Sooner', startsAt: inDays(2) }));
    await api.post('/api/events').set('Cookie', committee).send(event(branches.bhusawal, { title: 'Bhusawal only' }));

    const amalner = (await createFamily(branches.amalner, { account: 'member' })).cookie;
    const pune = (await createFamily(branches.pune, { account: 'member' })).cookie;
    expect(await list(amalner)).toEqual(['Sooner', 'Later']);
    expect(await list(pune)).toEqual([]);
  });

  it('moves finished events to past', async () => {
    const created = (await api.post('/api/events').set('Cookie', committee).send(event(branches.district))).body.event as EventDetail;
    await EventModel.updateOne({ _id: created.id }, { $set: { startsAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() - 2 * DAY + 3_600_000) } });
    expect(await list(committee)).toEqual([]);
    expect(await list(committee, 'past')).toEqual(['Annual gathering']);
  });

  it('counts RSVPs per family, shows organisers who is coming, and closes after the event', async () => {
    const created = (await api.post('/api/events').set('Cookie', committee).send(event(branches.district))).body.event as EventDetail;
    const a = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Anil Wagh' }] });
    const b = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Kavita Dhole' }] });

    await api.put(`/api/events/${created.id}/rsvp`).set('Cookie', a.cookie).send({ people: 4 });
    const second = (await api.put(`/api/events/${created.id}/rsvp`).set('Cookie', b.cookie).send({ people: 2 })).body.event as EventDetail;
    expect(second).toMatchObject({ headcount: 6, families: 2, myPeople: 2 });
    expect(second.attendees).toBeUndefined();

    // Changing your mind replaces your answer; 0 clears it.
    await api.put(`/api/events/${created.id}/rsvp`).set('Cookie', a.cookie).send({ people: 3 });
    await api.put(`/api/events/${created.id}/rsvp`).set('Cookie', b.cookie).send({ people: 0 });

    const organiser = (await api.get(`/api/events/${created.id}`).set('Cookie', committee)).body.event as EventDetail;
    expect(organiser).toMatchObject({ headcount: 3, families: 1 });
    expect(organiser.attendees).toEqual([expect.objectContaining({ headName: 'Anil Wagh', people: 3 })]);

    await EventModel.updateOne({ _id: created.id }, { $set: { startsAt: new Date(Date.now() - 2 * DAY) } });
    const late = await api.put(`/api/events/${created.id}/rsvp`).set('Cookie', a.cookie).send({ people: 1 });
    expect(late.body.error.issues[0].message).toBe('validation.rsvpClosed');
  });

  it('keeps other branches out, and only lets the branch committee organise', async () => {
    const created = (await api.post('/api/events').set('Cookie', committee).send(event(branches.bhusawal))).body.event as EventDetail;
    const pune = (await createFamily(branches.pune, { account: 'member' })).cookie;
    expect((await api.get(`/api/events/${created.id}`).set('Cookie', pune)).status).toBe(404);
    expect((await api.put(`/api/events/${created.id}/rsvp`).set('Cookie', pune).send({ people: 2 })).status).toBe(404);

    const member = (await createFamily(branches.bhusawal, { account: 'member' })).cookie;
    expect((await api.post('/api/events').set('Cookie', member).send(event(branches.bhusawal))).status).toBe(403);
    const townCommittee = (await createFamily(branches.amalner, { account: 'committee' })).cookie;
    expect((await api.post('/api/events').set('Cookie', townCommittee).send(event(branches.district))).status).toBe(403);
    expect((await api.delete(`/api/events/${created.id}`).set('Cookie', committee)).status).toBe(204);
  });

  it('validates dates, venue and map links', async () => {
    const res = await api
      .post('/api/events')
      .set('Cookie', committee)
      .send(event(branches.district, { startsAt: 'next sunday', venue: '', mapUrl: 'javascript:alert(1)' }));
    const byPath = Object.fromEntries(res.body.error.issues.map((i: { path: string; message: string }) => [i.path, i.message]));
    expect(byPath).toMatchObject({ startsAt: 'validation.eventDate', venue: 'validation.venue', mapUrl: 'validation.mapUrl' });

    const backwards = await api.post('/api/events').set('Cookie', committee).send(event(branches.district, { startsAt: inDays(5), endsAt: inDays(4) }));
    expect(backwards.body.error.issues).toEqual([{ path: 'endsAt', message: 'validation.eventEnd' }]);
  });
});
