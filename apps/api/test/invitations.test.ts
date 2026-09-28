import type { InvitationAudience, InvitationDetail, LinkKind, MyInvitations } from '@samaj/shared';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FamilyLinkModel, linkPair } from '../src/models/family-link.model';
import { InvitationGuestModel, InvitationModel } from '../src/models/invitation.model';
import { NoticeModel } from '../src/models/notice.model';
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
      { functionId: haldi?.id, yes: 1, maybe: 0, no: 1, people: 4, children: 0 },
      { functionId: lagna?.id, yes: 1, maybe: 1, no: 0, people: 6, children: 0 },
    ]);
    // "No" means nobody is coming.
    expect(seen.guests?.find((g) => g.family.headName === 'Vijay Karale')?.answers[0]).toEqual({ functionId: haldi?.id, answer: 'no', people: 0, children: 0 });
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
    expect(theirs.mine?.answers).toEqual([{ functionId: lagna?.id, answer: 'yes', people: 3, children: 0 }]);

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

  it('opens by its link for anyone, takes replies there, and stops when the link is turned off', async () => {
    const { host, parents } = await setup();
    const inv = (await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId]))).body.invitation as InvitationDetail;
    expect(inv.shareToken).toBeNull();

    // Only the host makes the link.
    expect((await api.put(`/api/invitations/${inv.id}/link`).set('Cookie', parents.cookie)).status).toBe(403);
    const on = (await api.put(`/api/invitations/${inv.id}/link`).set('Cookie', host.cookie)).body.invitation as InvitationDetail;
    const token = on.shareToken as string;
    expect(token).toMatch(/^[\w-]{16}$/);

    // No cookie: the card, and nothing about the guests.
    const card = await api.get(`/api/public/invitations/${token}`);
    expect(card.status).toBe(200);
    expect(card.body.invitation).toMatchObject({ kind: 'wedding', forNames: 'Rohit & Kavya', hostName: 'Anil Wagh', closed: false });
    expect(JSON.stringify(card.body)).not.toContain(parents.familyId);
    expect((await api.get('/api/public/invitations/not-a-real-token1')).status).toBe(404);

    const [haldi, lagna] = on.functions.map((f) => f.id);
    const first = await api.post(`/api/public/invitations/${token}/reply`).send({
      name: 'Ramesh Patil',
      place: 'Nashik',
      answers: [
        { functionId: haldi, answer: 'yes', people: 3 },
        { functionId: lagna, answer: 'no', people: 5 },
      ],
    });
    expect(first.status).toBe(200);
    const key = first.body.reply.key as string;
    expect(first.body.reply.answers[1]).toEqual({ functionId: lagna, answer: 'no', people: 0, children: 0 });

    // The same phone changes its answer rather than adding a second one.
    await api.post(`/api/public/invitations/${token}/reply`).send({ name: 'Ramesh Patil', place: 'Nashik', key, answers: [{ functionId: haldi, answer: 'yes', people: 4 }, { functionId: lagna, answer: 'maybe', people: 2 }] });
    await api.post(`/api/public/invitations/${token}/reply`).send({ name: 'Sunita', answers: [{ functionId: haldi, answer: 'yes', people: 2 }, { functionId: lagna, answer: 'yes', people: 2 }] });
    expect((await api.post(`/api/public/invitations/${token}/reply`).send({ name: 'x', answers: [{ functionId: haldi, answer: 'yes', people: 1 }] })).body.error.issues).toContainEqual({ path: 'name', message: 'validation.replyName' });

    let seen = (await api.get(`/api/invitations/${inv.id}`).set('Cookie', host.cookie)).body.invitation as InvitationDetail;
    expect(seen.linkReplies?.map((r) => [r.name, r.place])).toEqual([['Ramesh Patil', 'Nashik'], ['Sunita', null]]);
    expect(seen.tally?.find((x) => x.functionId === haldi)).toMatchObject({ yes: 2, people: 6 });
    // A guest family sees none of it.
    const guestView = (await api.get(`/api/invitations/${inv.id}`).set('Cookie', parents.cookie)).body.invitation as InvitationDetail;
    expect(guestView.linkReplies).toBeUndefined();
    expect(guestView.shareToken).toBeUndefined();

    // The host removes a reply.
    seen = (await api.delete(`/api/invitations/${inv.id}/link-replies/${seen.linkReplies?.[1]?.id}`).set('Cookie', host.cookie)).body.invitation as InvitationDetail;
    expect(seen.linkReplies).toHaveLength(1);

    // Off: the old link is dead; on again: a new one. Replies stay.
    await api.delete(`/api/invitations/${inv.id}/link`).set('Cookie', host.cookie);
    expect((await api.get(`/api/public/invitations/${token}`)).status).toBe(404);
    const again = (await api.put(`/api/invitations/${inv.id}/link`).set('Cookie', host.cookie)).body.invitation as InvitationDetail;
    expect(again.shareToken).not.toBe(token);
    expect(again.linkReplies).toHaveLength(1);

    // Cancelled: the card says so, and replies are refused.
    await api.post(`/api/invitations/${inv.id}/cancel`).set('Cookie', host.cookie);
    expect((await api.get(`/api/public/invitations/${again.shareToken}`)).body.invitation).toMatchObject({ cancelled: true, closed: true });
    expect((await api.post(`/api/public/invitations/${again.shareToken}/reply`).send({ name: 'Late comer', answers: [{ functionId: haldi, answer: 'yes', people: 1 }] })).status).toBe(409);
  });

  it('carries the family’s printed patrika, a picture or a PDF, to guests and the link', async () => {
    const { host, parents, stranger } = await setup();
    const inv = (await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId]))).body.invitation as InvitationDetail;
    expect(inv.patrika).toBeNull();
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
    const PDF = Buffer.from('%PDF-1.4 fake patrika');

    expect((await api.put(`/api/invitations/${inv.id}/patrika`).set('Cookie', parents.cookie).set('Content-Type', 'image/jpeg').send(JPEG)).status).toBe(403);
    const bad = await api.put(`/api/invitations/${inv.id}/patrika`).set('Cookie', host.cookie).set('Content-Type', 'image/png').send(Buffer.from('not an image'));
    expect(bad.body.error.issues).toEqual([{ path: 'patrika', message: 'validation.patrikaType' }]);

    const up = (await api.put(`/api/invitations/${inv.id}/patrika`).set('Cookie', host.cookie).set('Content-Type', 'image/jpeg').send(JPEG)).body.invitation as InvitationDetail;
    expect(up.patrika).toEqual({ kind: 'image', version: 1 });
    const got = await api.get(`/api/invitations/${inv.id}/patrika`).set('Cookie', parents.cookie);
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect((await api.get(`/api/invitations/${inv.id}/patrika`).set('Cookie', stranger.cookie)).status).toBe(404);

    // A PDF replaces it, and opens sandboxed.
    const pdf = (await api.put(`/api/invitations/${inv.id}/patrika`).set('Cookie', host.cookie).set('Content-Type', 'application/pdf').send(PDF)).body.invitation as InvitationDetail;
    expect(pdf.patrika).toEqual({ kind: 'pdf', version: 2 });
    const token = ((await api.put(`/api/invitations/${inv.id}/link`).set('Cookie', host.cookie)).body.invitation as InvitationDetail).shareToken;
    expect((await api.get(`/api/public/invitations/${token}`)).body.invitation.patrika).toEqual({ kind: 'pdf', version: 2 });
    const shared = await api.get(`/api/public/invitations/${token}/patrika`);
    expect(shared.headers['content-type']).toBe('application/pdf');
    expect(shared.headers['content-security-policy']).toBe('sandbox');

    const gone = (await api.delete(`/api/invitations/${inv.id}/patrika`).set('Cookie', host.cookie)).body.invitation as InvitationDetail;
    expect(gone.patrika).toBeNull();
    expect((await api.get(`/api/public/invitations/${token}/patrika`)).status).toBe(404);
  });

  it('carries the patrika’s names and muhurat, and remembers someone from the host’s own family', async () => {
    const { host, parents } = await setup();
    const functions = wedding([]).functions.map((f, i) => (i === 1 ? { ...f, muhuratAt: at(11, 11).replace(':00:00', ':34:00') } : f));
    const inv = (
      await api
        .post('/api/invitations')
        .set('Cookie', host.cookie)
        .send({
          ...wedding([parents.familyId]),
          functions,
          honorees: [{ name: 'चि. रोहित', detail: 'श्री. अनिल वाघ यांचे चिरंजीव, अमळनेर' }, { name: 'चि.सौ.कां. काव्या' }],
          kripa: ['कै. रामराव वाघ', ''],
          blessings: ['श्री. गणपत वाघ'],
          inviters: ['श्री. अनिल वाघ', 'सौ. सुनिता वाघ'],
        })
    ).body.invitation as InvitationDetail;
    expect(inv.honorees).toEqual([{ name: 'चि. रोहित', detail: 'श्री. अनिल वाघ यांचे चिरंजीव, अमळनेर' }, { name: 'चि.सौ.कां. काव्या', detail: null }]);
    expect(inv.kripa).toEqual(['कै. रामराव वाघ']);
    expect(inv.functions[1]?.muhuratAt).toBe(new Date((functions[1] as { muhuratAt: string }).muhuratAt).toISOString());
    // Guests and the link see the same names.
    const guest = (await api.get(`/api/invitations/${inv.id}`).set('Cookie', parents.cookie)).body.invitation as InvitationDetail;
    expect(guest.inviters).toEqual(['श्री. अनिल वाघ', 'सौ. सुनिता वाघ']);

    // A muhurat days away from its function is a slip.
    const far = await api.put(`/api/invitations/${inv.id}`).set('Cookie', host.cookie).send({ ...wedding([]), functions: [{ ...functions[0], muhuratAt: at(20) }] });
    expect(far.body.error.issues).toContainEqual({ path: 'functions.0.muhuratAt', message: 'validation.muhurat' });

    // Remembrance: only someone from the host's own family.
    const shraddha = (memorialMemberId: string) => ({ kind: 'shraddha', forNames: 'कै. रामराव वाघ', functions: [{ name: 'श्राद्ध', startsAt: at(5), venue: 'Home' }], memorialMemberId, guestFamilyIds: [parents.familyId] });
    const other = await api.post('/api/invitations').set('Cookie', host.cookie).send(shraddha(parents.memberIds[0]!));
    expect(other.body.error.issues).toContainEqual({ path: 'memorialMemberId', message: 'validation.memorialMember' });
    const own = (await api.post('/api/invitations').set('Cookie', host.cookie).send(shraddha(host.memberIds[0]!))).body.invitation as InvitationDetail;
    expect(own.memorial).toMatchObject({ memberId: host.memberIds[0], name: 'Anil Wagh', photoVersion: null });
    expect((await api.get(`/api/invitations/${own.id}/memorial-photo`).set('Cookie', parents.cookie)).status).toBe(404);
  });

  it('counts children and places to stay, and marks an invitation changed after a guest answered', async () => {
    const { host, parents, inLaws } = await setup();
    const inv = (await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId, inLaws.familyId]))).body.invitation as InvitationDetail;
    const [haldi, lagna] = inv.functions.map((f) => f.id);
    const answer = (cookie: string, body: Record<string, unknown>) => api.put(`/api/invitations/${inv.id}/rsvp`).set('Cookie', cookie).send(body);

    expect((await answer(parents.cookie, { answers: [{ functionId: haldi, answer: 'yes', people: 2, children: 3 }] })).body.error.issues).toContainEqual({ path: 'answers.0.children', message: 'validation.rsvpChildren' });
    await answer(parents.cookie, { answers: [{ functionId: haldi, answer: 'yes', people: 5, children: 2 }, { functionId: lagna, answer: 'no', people: 5, children: 2 }], stay: 4 });
    await answer(inLaws.cookie, { answers: [{ functionId: haldi, answer: 'yes', people: 3, children: 1 }, { functionId: lagna, answer: 'yes', people: 3 }] });

    const seen = (await api.get(`/api/invitations/${inv.id}`).set('Cookie', host.cookie)).body.invitation as InvitationDetail;
    expect(seen.tally?.find((x) => x.functionId === haldi)).toMatchObject({ people: 8, children: 3 });
    expect(seen.tally?.find((x) => x.functionId === lagna)).toMatchObject({ people: 3, children: 0 });
    expect(seen.stayTally).toEqual({ replies: 1, people: 4 });
    expect(seen.guests?.find((g) => g.family.id === parents.familyId)?.stay).toBe(4);

    const guestView = async () => (await api.get(`/api/invitations/${inv.id}`).set('Cookie', parents.cookie)).body.invitation as InvitationDetail;
    expect((await guestView()).changedSinceAnswer).toBe(false);
    // Renaming a function isn't something to plan around; moving it is.
    const edit = (venue: string, name = 'हळद') => ({ ...wedding([]), functions: seen.functions.map((f, i) => ({ ...f, name: i === 0 ? name : f.name, venue: i === 0 ? venue : f.venue })) });
    await api.put(`/api/invitations/${inv.id}`).set('Cookie', host.cookie).send(edit(seen.functions[0]!.venue, 'हळदी समारंभ'));
    expect((await guestView()).changedSinceAnswer).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    await api.put(`/api/invitations/${inv.id}`).set('Cookie', host.cookie).send(edit('Samaj hall, Amalner'));
    const changed = await guestView();
    expect(changed.changedSinceAnswer).toBe(true);
    expect(((await api.get('/api/invitations').set('Cookie', parents.cookie)).body as MyInvitations).invited[0]?.changedSinceAnswer).toBe(true);
    // Answering again clears it.
    await new Promise((r) => setTimeout(r, 5));
    await answer(parents.cookie, { answers: changed.mine!.answers });
    expect((await guestView()).changedSinceAnswer).toBe(false);
  });

  it('groups the tree by how families are related, and offers earlier guest lists', async () => {
    const { host, parents, inLaws, friend } = await setup();
    let audience = (await api.get('/api/invitations/audience').set('Cookie', host.cookie)).body.audience as InvitationAudience;
    expect(Object.fromEntries(audience.tree.map((f) => [f.headName, f.group]))).toEqual({ 'Ganpat Wagh': 'family', 'Suresh Patil': 'inLaws' });
    expect(audience.earlier).toEqual([]);

    await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId, friend.familyId]));
    audience = (await api.get('/api/invitations/audience').set('Cookie', host.cookie)).body.audience as InvitationAudience;
    expect(audience.earlier).toHaveLength(1);
    expect(audience.earlier[0]).toMatchObject({ kind: 'wedding', forNames: 'Rohit & Kavya' });
    expect(audience.earlier[0]?.families.map((f) => f.headName).sort()).toEqual(['Ganpat Wagh', 'Vijay Karale']);
    // Another family's lists are its own.
    expect(((await api.get('/api/invitations/audience').set('Cookie', inLaws.cookie)).body.audience as InvitationAudience).earlier).toEqual([]);
  });

  it('lists functions in the next day and a half the family is going to or hosting', async () => {
    const { host, parents, inLaws } = await setup();
    const soon = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
    const inv = (
      await api
        .post('/api/invitations')
        .set('Cookie', host.cookie)
        .send({ kind: 'munj', forNames: 'Aarav', functions: [{ name: 'मुंज', startsAt: soon, venue: 'Hall' }, { name: 'भोजन', startsAt: at(9), venue: 'Hall' }], guestFamilyIds: [parents.familyId, inLaws.familyId] })
    ).body.invitation as InvitationDetail;
    const [munj, bhojan] = inv.functions.map((f) => f.id);
    await api.put(`/api/invitations/${inv.id}/rsvp`).set('Cookie', parents.cookie).send({ answers: [{ functionId: munj, answer: 'yes', people: 3 }, { functionId: bhojan, answer: 'yes', people: 3 }] });
    await api.put(`/api/invitations/${inv.id}/rsvp`).set('Cookie', inLaws.cookie).send({ answers: [{ functionId: munj, answer: 'no', people: 0 }, { functionId: bhojan, answer: 'yes', people: 2 }] });

    const upcoming = async (cookie: string) => ((await api.get('/api/invitations').set('Cookie', cookie)).body as MyInvitations).upcoming;
    expect(await upcoming(parents.cookie)).toEqual([expect.objectContaining({ name: 'मुंज', hostName: 'Anil Wagh', hosting: false })]);
    expect(await upcoming(inLaws.cookie)).toEqual([]);
    expect((await upcoming(host.cookie)).map((u) => [u.name, u.hosting])).toEqual([['मुंज', true]]);
    await api.post(`/api/invitations/${inv.id}/cancel`).set('Cookie', host.cookie);
    expect(await upcoming(parents.cookie)).toEqual([]);
  });
  it('asks the branch committee to share it, which posts a notice to the branch with the link', async () => {
    const { host, parents } = await setup();
    const committee = await createFamily(branches.district, { account: 'committee', people: [{ name: 'Branch Secretary' }] });
    const pune = await createFamily(branches.pune, { account: 'committee', people: [{ name: 'Pune Secretary' }] });
    const inv = (
      await api
        .post('/api/invitations')
        .set('Cookie', host.cookie)
        .send({ kind: 'dashakriya', forNames: 'कै. रामराव वाघ', functions: [{ name: 'दशक्रिया विधी', startsAt: at(3), venue: 'Amalner ghat' }], guestFamilyIds: [parents.familyId] })
    ).body.invitation as InvitationDetail;

    // Only the host asks, and asking makes the link.
    expect((await api.put(`/api/invitations/${inv.id}/branch-share`).set('Cookie', parents.cookie)).status).toBe(403);
    const asked = (await api.put(`/api/invitations/${inv.id}/branch-share`).set('Cookie', host.cookie)).body.invitation as InvitationDetail;
    expect(asked.branchShare).toMatchObject({ status: 'pending', requestedByName: 'Anil Wagh', branch: { name: 'Amalner' } });
    expect(asked.shareToken).toBeTruthy();
    expect((await api.put(`/api/invitations/${inv.id}/branch-share`).set('Cookie', host.cookie)).status).toBe(409);

    // The committee above the family's branch sees it; another branch's doesn't; members can't list.
    const list = async (cookie: string) => (await api.get('/api/invitations/branch-requests').set('Cookie', cookie)).body.requests as { id: string; shareToken: string }[];
    expect((await list(committee.cookie)).map((r) => r.id)).toEqual([inv.id]);
    expect(await list(pune.cookie)).toEqual([]);
    expect((await api.get('/api/invitations/branch-requests').set('Cookie', parents.cookie)).status).toBe(403);
    expect((await api.post(`/api/invitations/${inv.id}/branch-share/approve`).set('Cookie', pune.cookie).send({ title: 'x x x', body: 'y' })).status).toBe(404);

    const approved = await api.post(`/api/invitations/${inv.id}/branch-share/approve`).set('Cookie', committee.cookie).send({ title: 'भावपूर्ण श्रद्धांजली: कै. रामराव वाघ', body: `दशक्रिया विधी … /i/${asked.shareToken}` });
    expect(approved.body.branchShare).toMatchObject({ status: 'shared', decidedByName: 'Branch Secretary' });
    const notice = await NoticeModel.findById(approved.body.branchShare.noticeId).lean();
    expect(notice).toMatchObject({ kind: 'condolence', title: 'भावपूर्ण श्रद्धांजली: कै. रामराव वाघ' });
    expect(String(notice?.branchId)).toBe(branches.amalner);
    expect(await list(committee.cookie)).toEqual([]);

    // Declined, with a reason the host sees; then they may ask again.
    const second = (await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId]))).body.invitation as InvitationDetail;
    await api.put(`/api/invitations/${second.id}/branch-share`).set('Cookie', host.cookie);
    expect((await api.post(`/api/invitations/${second.id}/branch-share/decline`).set('Cookie', committee.cookie).send({ reason: 'x' })).body.error.issues).toContainEqual({ path: 'reason', message: 'validation.declineReason' });
    await api.post(`/api/invitations/${second.id}/branch-share/decline`).set('Cookie', committee.cookie).send({ reason: 'Weddings go to guests, not the whole branch.' });
    const seen = (await api.get(`/api/invitations/${second.id}`).set('Cookie', host.cookie)).body.invitation as InvitationDetail;
    expect(seen.branchShare).toMatchObject({ status: 'declined', reason: 'Weddings go to guests, not the whole branch.' });
    expect((await api.put(`/api/invitations/${second.id}/branch-share`).set('Cookie', host.cookie)).body.invitation.branchShare.status).toBe('pending');
    // Guests never see the request.
    expect(((await api.get(`/api/invitations/${second.id}`).set('Cookie', parents.cookie)).body.invitation as InvitationDetail).branchShare).toBeUndefined();
  });

  it('keeps a card design that suits the occasion, and falls back to the occasion default', async () => {
    const { host, parents } = await setup();
    const royal = (await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId], { theme: 'royal' }))).body.invitation as InvitationDetail;
    expect(royal.theme).toBe('royal');
    expect(((await api.get(`/api/invitations/${royal.id}`).set('Cookie', parents.cookie)).body.invitation as InvitationDetail).theme).toBe('royal');
    // A celebration's design on a remembrance is shown as the remembrance default.
    const shraddha = (
      await api
        .post('/api/invitations')
        .set('Cookie', host.cookie)
        .send({ kind: 'shraddha', theme: 'royal', functions: [{ name: 'श्राद्ध', startsAt: at(5), venue: 'Home' }], guestFamilyIds: [parents.familyId] })
    ).body.invitation as InvitationDetail;
    expect(shraddha.theme).toBe('quiet');
    expect((await api.post('/api/invitations').set('Cookie', host.cookie).send(wedding([parents.familyId], { theme: 'neon' }))).status).toBe(400);
  });
});
