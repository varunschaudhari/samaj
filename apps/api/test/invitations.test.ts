import type { InvitationAudience, InvitationDetail, LinkKind, MyInvitations } from '@samaj/shared';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FamilyLinkModel, linkPair } from '../src/models/family-link.model';
import { InvitationGuestModel, InvitationModel } from '../src/models/invitation.model';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
});

const link = (from: string, to: string, kind: LinkKind) =>
  FamilyLinkModel.create({ fromFamilyId: from, toFamilyId: to, kind, status: 'accepted', pair: linkPair(from, to), requestedByUserId: new Types.ObjectId(), requestedByName: 'x' });

const day = 86_400_000;
const at = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * day);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const wedding = (guestFamilyIds: string[], extra: Record<string, unknown> = {}) => ({
  kind: 'wedding',
  forNames: 'Rohit & Kavya',
  message: 'सहकुटुंब सहपरिवार उपस्थित राहावे.',
  functions: [
    { name: 'हळद', startsAt: at(10, 17), venue: 'Home, Amalner' },
    { name: 'लग्न', startsAt: at(11, 11), endsAt: at(11, 14), venue: 'Samaj hall, Amalner', mapUrl: 'https://maps.google.com/?q=Amalner' },
  ],
  guestFamilyIds,
  ...extra,
});

async function setup() {
  const host = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Anil Wagh' }] });
  const parents = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Ganpat Wagh' }] });
  const inLaws = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Suresh Patil' }] });
  const friend = await createFamily(branches.pune, { account: 'member', people: [{ name: 'Vijay Karale' }] });
  const stranger = await createFamily(branches.pune, { account: 'member', people: [{ name: 'Someone Else' }] });
  await link(host.familyId, parents.familyId, 'parents');
  await link(host.familyId, inLaws.familyId, 'inLaws');
  return { host, parents, inLaws, friend, stranger };
}

describe('invitations', () => {
  it('offers the family tree and linked families, and goes only to the families invited', async () => {
    const { host, parents, inLaws, friend, stranger } = await setup();
    const audience = (await api.get('/api/invitations/audience').set('Cookie', host.cookie)).body.audience as InvitationAudience;
    expect(audience.tree.map((f) => f.headName).sort()).toEqual(['Ganpat Wagh', 'Suresh Patil']);
    expect(audience.linked).toEqual([]);
    expect(audience.leftToday).toBeGreaterThan(0);

    const sent = await api
      .post('/api/invitations')
      .set('Cookie', host.cookie)
      .send(wedding([parents.familyId, inLaws.familyId, friend.familyId, host.familyId], { treeFamilyIds: [parents.familyId, inLaws.familyId] }));
    expect(sent.status).toBe(201);
    const invitation = sent.body.invitation as InvitationDetail;
    expect(invitation).toMatchObject({ isHost: true, invitedCount: 3, functionCount: 2, host: { headName: 'Anil Wagh' } });
    // Functions in time order; the host is never their own guest.
    expect(invitation.functions.map((f) => f.name)).toEqual(['हळद', 'लग्न']);
    expect(invitation.guests?.map((g) => [g.family.headName, g.via]).sort()).toEqual([
      ['Ganpat Wagh', 'tree'],
      ['Suresh Patil', 'tree'],
      ['Vijay Karale', 'picked'],
    ]);

    const mine = (await api.get('/api/invitations').set('Cookie', friend.cookie)).body as MyInvitations;
    expect(mine.invited).toMatchObject([{ id: invitation.id, forNames: 'Rohit & Kavya', answered: false }]);
    // A guest sees the card, not the guest list.
    const asGuest = (await api.get(`/api/invitations/${invitation.id}`).set('Cookie', friend.cookie)).body.invitation as InvitationDetail;
    expect(asGuest).toMatchObject({ isHost: false, message: 'सहकुटुंब सहपरिवार उपस्थित राहावे.' });
    expect(asGuest).not.toHaveProperty('guests');
    expect((await api.get(`/api/invitations/${invitation.id}`).set('Cookie', stranger.cookie)).status).toBe(404);
  });

  it('collects answers per function and tallies the headcount for the host', async () => {
    const { host, parents, friend, stranger } = await setup();
    const inv = (await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId, friend.familyId]))).body.invitation as InvitationDetail;
    const [haldi, lagna] = inv.functions;
    const answer = (cookie: string, answers: unknown[]) => api.put(`/api/invitations/${inv.id}/rsvp`).set('Cookie', cookie).send({ answers });

    expect((await answer(parents.cookie, [{ functionId: haldi?.id, answer: 'yes', people: 4 }, { functionId: lagna?.id, answer: 'yes', people: 6 }])).status).toBe(200);
    expect((await answer(friend.cookie, [{ functionId: haldi?.id, answer: 'no', people: 3 }, { functionId: lagna?.id, answer: 'maybe', people: 2 }])).status).toBe(200);
    expect((await answer(stranger.cookie, [{ functionId: haldi?.id, answer: 'yes', people: 2 }])).status).toBe(404);

    const seen = (await api.get(`/api/invitations/${inv.id}`).set('Cookie', host.cookie)).body.invitation as InvitationDetail;
    expect(seen.repliedCount).toBe(2);
    expect(seen.tally).toEqual([
      { functionId: haldi?.id, yes: 1, maybe: 0, no: 1, people: 4 },
      { functionId: lagna?.id, yes: 1, maybe: 1, no: 0, people: 6 },
    ]);
    // "No" means nobody is coming.
    expect(seen.guests?.find((g) => g.family.headName === 'Vijay Karale')?.answers[0]).toEqual({ functionId: haldi?.id, answer: 'no', people: 0 });
    expect(seen.guests?.find((g) => g.family.headName === 'Ganpat Wagh')?.respondedByName).toBe('Ganpat Wagh');
  });

  it('keeps answers through an edit, drops those for a removed function, and closes when cancelled', async () => {
    const { host, parents } = await setup();
    const inv = (await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId]))).body.invitation as InvitationDetail;
    const [haldi, lagna] = inv.functions;
    await api.put(`/api/invitations/${inv.id}/rsvp`).set('Cookie', parents.cookie).send({ answers: [{ functionId: haldi?.id, answer: 'yes', people: 2 }, { functionId: lagna?.id, answer: 'yes', people: 3 }] });

    // Only the host edits: the हळद is dropped, the लग्न moves an hour.
    const edited = await api
      .put(`/api/invitations/${inv.id}`)
      .set('Cookie', host.cookie)
      .send({ kind: 'wedding', forNames: 'Rohit & Kavya', functions: [{ id: lagna?.id, name: 'लग्न', startsAt: at(11, 12), venue: 'Samaj hall, Amalner' }] });
    expect(edited.status).toBe(200);
    expect((await api.put(`/api/invitations/${inv.id}`).set('Cookie', parents.cookie).send({ kind: 'wedding', functions: [] })).status).toBe(400);
    const theirs = (await api.get(`/api/invitations/${inv.id}`).set('Cookie', parents.cookie)).body.invitation as InvitationDetail;
    expect(theirs.mine?.answers).toEqual([{ functionId: lagna?.id, answer: 'yes', people: 3 }]);

    expect((await api.post(`/api/invitations/${inv.id}/cancel`).set('Cookie', host.cookie)).body.invitation).toMatchObject({ cancelled: true, closed: true });
    expect((await api.put(`/api/invitations/${inv.id}/rsvp`).set('Cookie', parents.cookie).send({ answers: [{ functionId: lagna?.id, answer: 'no', people: 0 }] })).status).toBe(409);
  });

  it('respects a family that hid the host’s invitations, and only verified families send or receive', async () => {
    const { host, parents, friend } = await setup();
    const waiting = await createFamily(branches.amalner, { account: 'member', status: 'pending' });
    expect((await api.put(`/api/invitations/hidden/${host.familyId}`).set('Cookie', friend.cookie)).status).toBe(204);

    const inv = (await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId, friend.familyId]))).body.invitation as InvitationDetail;
    // Left out without the host being told.
    expect(inv.invitedCount).toBe(1);
    const mine = (await api.get('/api/invitations').set('Cookie', friend.cookie)).body as MyInvitations;
    expect(mine.invited).toEqual([]);
    expect(mine.hidden.map((f) => f.headName)).toEqual(['Anil Wagh']);
    expect((await api.delete(`/api/invitations/hidden/${host.familyId}`).set('Cookie', friend.cookie)).status).toBe(204);

    expect((await api.post('/api/invitations').set('Cookie', waiting.cookie).send(wedding([host.familyId]))).status).toBe(403);
    const toPending = await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([waiting.familyId]));
    expect(toPending.status).toBe(400);
    expect(toPending.body.error.issues).toEqual([{ path: 'guestFamilyIds', message: 'validation.guestNotAllowed' }]);
  });

  it('limits how many families one family can invite in a day', async () => {
    const { host, parents } = await setup();
    // As if the family had already invited 600 households today.
    const old = await InvitationModel.create({ familyId: host.familyId, kind: 'other', functions: [], firstAt: new Date(), lastAt: new Date(), sentByUserId: new Types.ObjectId(), sentByName: 'x' });
    await InvitationGuestModel.insertMany(
      Array.from({ length: 600 }, () => ({ invitationId: old._id, familyId: new Types.ObjectId(), hostFamilyId: host.familyId, via: 'picked', lastAt: new Date() })),
    );
    const res = await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId]));
    expect(res.status).toBe(409);
    expect(res.body.error.issues).toEqual([{ path: 'guestFamilyIds', message: 'validation.dailyInvitations' }]);
  });
});
