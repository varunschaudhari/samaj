import type { FamilyDetail, FamilyRequests, FamilyTree, MemberMoveView, MemberPage, PendingMember } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemberModel } from '../src/models/member.model';
import { ProfileModel } from '../src/models/profile.model';
import { UserModel } from '../src/models/user.model';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
});

const family = async (cookie: string, id: string) => (await api.get(`/api/families/${id}`).set('Cookie', cookie)).body.family as FamilyDetail;
const requests = async (cookie: string, id: string) => (await api.get(`/api/families/${id}/requests`).set('Cookie', cookie)).body.requests as FamilyRequests;
const directory = async (cookie: string, q: string) => ((await api.get(`/api/members?q=${q}`).set('Cookie', cookie)).body as MemberPage).items.map((m) => m.name);

describe('people added to a verified family wait for the committee', () => {
  const son = { name: 'Rohit Wagh', relation: 'son', gender: 'male', birthYear: '1995', phone: '9822098220', consent: true };

  it('keeps them out of the directory until the branch committee approves', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Anil Wagh' }] });
    const neighbour = await createFamily(branches.bhusawal, { account: 'member' });
    const committee = await createFamily(branches.district, { account: 'committee' });

    const added = (await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send(son)).body.family as FamilyDetail;
    const rohit = added.members.find((m) => m.name === 'Rohit Wagh');
    expect(rohit).toMatchObject({ approval: 'pending', canInvite: false });

    // Hidden from other families, in the directory and on the family page.
    expect(await directory(neighbour.cookie, 'rohit')).toEqual([]);
    expect((await family(neighbour.cookie, own.familyId)).members.map((m) => m.name)).toEqual(['Anil Wagh']);
    // No invite code yet.
    const invite = await api.post(`/api/families/${own.familyId}/members/${rohit?.id}/invite`).set('Cookie', own.cookie);
    expect(invite.status).toBe(409);
    // Verifying something else about the family doesn't list them.
    expect((await MemberModel.findById(rohit?.id).lean())?.familyStatus).toBe('pending');

    const queue = (await api.get('/api/member-approvals').set('Cookie', committee.cookie)).body.items as PendingMember[];
    expect(queue).toMatchObject([{ name: 'Rohit Wagh', addedByName: 'Anil Wagh', family: { headName: 'Anil Wagh' } }]);
    expect((await api.get('/api/verifications/count').set('Cookie', committee.cookie)).body).toMatchObject({ members: 1, pending: 1 });

    // Members can't approve.
    expect((await api.post(`/api/member-approvals/${rohit?.id}/approve`).set('Cookie', neighbour.cookie)).status).toBe(403);
    expect((await api.post(`/api/member-approvals/${rohit?.id}/approve`).set('Cookie', committee.cookie)).status).toBe(204);
    expect(await directory(neighbour.cookie, 'rohit')).toEqual(['Rohit Wagh']);
    expect((await family(own.cookie, own.familyId)).history?.[0]).toMatchObject({ action: 'memberApproved', note: 'Rohit Wagh' });
  });

  it('removes them when the committee turns them down, with the reason in the history', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member' });
    const committee = await createFamily(branches.district, { account: 'committee' });
    const added = (await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send(son)).body.family as FamilyDetail;
    const id = added.members.find((m) => m.name === 'Rohit Wagh')?.id;

    expect((await api.post(`/api/member-approvals/${id}/reject`).set('Cookie', committee.cookie).send({ reason: 'Not part of this household.' })).status).toBe(204);
    const after = await family(own.cookie, own.familyId);
    expect(after.members.map((m) => m.name)).not.toContain('Rohit Wagh');
    expect(after.history?.[0]).toMatchObject({ action: 'memberRejected', note: 'Rohit Wagh: Not part of this household.' });
  });

  it('lists people at once when the committee adds them, or while the whole family is still waiting', async () => {
    const verified = await createFamily(branches.bhusawal);
    const committee = await createFamily(branches.district, { account: 'committee' });
    const byCommittee = (await api.post(`/api/families/${verified.familyId}/members`).set('Cookie', committee.cookie).send(son)).body.family as FamilyDetail;
    expect(byCommittee.members.find((m) => m.name === 'Rohit Wagh')?.approval).toBe('approved');

    const pending = await createFamily(branches.bhusawal, { status: 'pending', account: 'member' });
    const own = (await api.post(`/api/families/${pending.familyId}/members`).set('Cookie', pending.cookie).send({ ...son, phone: '' })).body.family as FamilyDetail;
    expect(own.members.find((m) => m.name === 'Rohit Wagh')?.approval).toBe('approved');
  });

  it("doesn't let a committee member approve additions to their own family", async () => {
    const committee = await createFamily(branches.district, { account: 'committee' });
    const added = (await api.post(`/api/families/${committee.familyId}/members`).set('Cookie', committee.cookie).send(son)).body.family as FamilyDetail;
    const id = added.members.find((m) => m.name === 'Rohit Wagh')?.id;
    expect(added.members.find((m) => m.id === id)?.approval).toBe('pending');
    expect((await api.get('/api/member-approvals').set('Cookie', committee.cookie)).body.items).toEqual([]);
    expect((await api.post(`/api/member-approvals/${id}/approve`).set('Cookie', committee.cookie)).status).toBe(403);
  });
});

describe('links between families', () => {
  it('is proposed by one family, accepted by the other, and shown to both with the right relation', async () => {
    const son = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Rohit Wagh' }] });
    const parents = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Anil Wagh' }] });
    const visitor = await createFamily(branches.pune, { account: 'member' });

    expect((await family(son.cookie, parents.familyId)).permissions.canLink).toBe(true);
    const sent = await api.post('/api/links').set('Cookie', son.cookie).send({ toFamilyId: parents.familyId, kind: 'parents' });
    expect(sent.status).toBe(201);
    expect((sent.body.requests as FamilyRequests).outgoingLinks).toMatchObject([{ kind: 'parents', family: { headName: 'Anil Wagh' } }]);

    // The other side reads it the other way round.
    const incoming = (await requests(parents.cookie, parents.familyId)).incomingLinks;
    expect(incoming).toMatchObject([{ kind: 'children', family: { headName: 'Rohit Wagh' }, requestedByName: 'Rohit Wagh' }]);

    // Only one link per pair, whichever side asks.
    expect((await api.post('/api/links').set('Cookie', parents.cookie).send({ toFamilyId: son.familyId, kind: 'children' })).status).toBe(409);
    // Only the family asked can accept.
    expect((await api.post(`/api/links/${incoming[0]?.id}/accept`).set('Cookie', son.cookie)).status).toBe(403);
    expect((await api.post(`/api/links/${incoming[0]?.id}/accept`).set('Cookie', parents.cookie)).status).toBe(200);

    expect((await family(son.cookie, son.familyId)).links).toMatchObject([{ kind: 'parents', family: { headName: 'Anil Wagh' }, canRemove: true }]);
    expect((await family(parents.cookie, parents.familyId)).links).toMatchObject([{ kind: 'children', family: { headName: 'Rohit Wagh' } }]);
    // Anyone who can see the family sees its links, but can't remove them.
    expect((await family(visitor.cookie, son.familyId)).links).toMatchObject([{ kind: 'parents', canRemove: false }]);
    expect((await family(son.cookie, parents.familyId)).permissions.canLink).toBe(false);

    const linkId = (await family(son.cookie, son.familyId)).links[0]?.id;
    expect((await api.delete(`/api/links/${linkId}`).set('Cookie', visitor.cookie)).status).toBe(403);
    expect((await api.delete(`/api/links/${linkId}`).set('Cookie', parents.cookie)).status).toBe(204);
    expect((await family(son.cookie, son.familyId)).links).toEqual([]);
    expect((await family(son.cookie, son.familyId)).history?.[0]?.action).toBe('unlinked');
  });

  it('needs both families verified', async () => {
    const waiting = await createFamily(branches.amalner, { status: 'pending', account: 'member' });
    const other = await createFamily(branches.amalner);
    expect((await api.post('/api/links').set('Cookie', waiting.cookie).send({ toFamilyId: other.familyId, kind: 'relatives' })).status).toBe(409);
  });
});

describe('moving a person to another family', () => {
  async function setup() {
    const bride = await createFamily(branches.bhusawal, {
      account: 'member',
      people: [{ name: 'Suresh Patil' }, { name: 'Priya Patil', relation: 'daughter', gender: 'female', birthYear: 1998 }],
    });
    const priyaId = bride.memberIds[1] ?? '';
    // Priya has her own sign-in and a live matrimony profile.
    const priya = await UserModel.create({
      name: 'Priya Patil',
      phone: '+919822011111',
      passwordHash: 'x',
      branchId: branches.bhusawal,
      familyId: bride.familyId,
      memberId: priyaId,
    });
    await MemberModel.updateOne({ _id: priyaId }, { $set: { userId: priya._id, phone: '+919822011111' } });
    await ProfileModel.create({
      memberId: priyaId,
      familyId: bride.familyId,
      contactName: 'Suresh Patil',
      contactPhone: '+919822000000',
      status: 'active',
      consentByUserId: priya._id,
      consentAt: new Date(),
      gender: 'female',
      birthYear: 1998,
      branchId: branches.bhusawal,
      branchAncestors: [branches.district],
    });
    const groom = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Rohit Wagh' }] });
    const committee = await createFamily(branches.district, { account: 'committee' });
    return { bride, groom, committee, priyaId, priyaUserId: String(priya._id) };
  }

  it('moves them once the old family agrees and the committee approves, keeping their account', async () => {
    const { bride, groom, committee, priyaId, priyaUserId } = await setup();

    expect((await family(groom.cookie, bride.familyId)).permissions.canRequestMove).toBe(true);
    const asked = await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: priyaId, relation: 'daughterInLaw', note: 'Married on 10 May' });
    expect(asked.status).toBe(201);
    const move = asked.body.move as MemberMoveView;
    expect(move).toMatchObject({ status: 'awaitingFamily', member: { name: 'Priya Patil' }, from: { headName: 'Suresh Patil' }, to: { headName: 'Rohit Wagh' } });

    // A second request for the same person waits for the first.
    expect((await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: priyaId, relation: 'spouse' })).status).toBe(409);
    expect((await requests(bride.cookie, bride.familyId)).movesOut).toMatchObject([{ id: move.id, note: 'Married on 10 May' }]);
    expect((await requests(groom.cookie, groom.familyId)).movesIn).toMatchObject([{ id: move.id }]);

    // Order matters: the committee can't approve before the family agrees, and the new family can't agree for the old.
    expect((await api.post(`/api/moves/${move.id}/approve`).set('Cookie', committee.cookie)).status).toBe(409);
    expect((await api.post(`/api/moves/${move.id}/agree`).set('Cookie', groom.cookie)).status).toBe(403);
    const agreed = await api.post(`/api/moves/${move.id}/agree`).set('Cookie', bride.cookie);
    expect(agreed.body.move).toMatchObject({ status: 'awaitingCommittee', agreedByName: 'Suresh Patil' });

    expect((await api.get('/api/moves/pending').set('Cookie', committee.cookie)).body.items).toMatchObject([{ id: move.id }]);
    expect((await api.get('/api/verifications/count').set('Cookie', committee.cookie)).body).toMatchObject({ moves: 1 });
    expect((await api.post(`/api/moves/${move.id}/approve`).set('Cookie', committee.cookie)).body.move).toMatchObject({ status: 'done' });

    const member = await MemberModel.findById(priyaId).lean<{ relation: string; place: string; familyStatus: string; familyId: unknown; branchPath: unknown[] }>();
    expect(member).toMatchObject({ relation: 'daughterInLaw', place: 'Amalner', familyStatus: 'verified' });
    expect(String(member?.familyId)).toBe(groom.familyId);
    expect(member?.branchPath.map(String)).toEqual([branches.amalner, branches.district]);
    const user = await UserModel.findById(priyaUserId).lean();
    expect(String(user?.familyId)).toBe(groom.familyId);
    expect(String(user?.branchId)).toBe(branches.amalner);
    expect(await ProfileModel.findOne({ memberId: priyaId }).lean()).toMatchObject({ status: 'closed', closeReason: 'married' });

    expect((await family(groom.cookie, groom.familyId)).members.map((m) => m.name)).toContain('Priya Patil');
    expect((await family(bride.cookie, bride.familyId)).members.map((m) => m.name)).toEqual(['Suresh Patil']);
    expect((await family(bride.cookie, bride.familyId)).history?.slice(0, 2)).toMatchObject([
      { action: 'linked', note: 'Family of Rohit Wagh' },
      { action: 'movedOut', note: 'Priya Patil' },
    ]);
  });

  it('keeps her माहेर: the families become in-laws, and each page and the tree show where she went and came from', async () => {
    const { bride, groom, committee, priyaId } = await setup();
    const visitor = await createFamily(branches.pune, { account: 'member' });
    const move = (await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: priyaId, relation: 'daughterInLaw' })).body.move as MemberMoveView;
    await api.post(`/api/moves/${move.id}/agree`).set('Cookie', bride.cookie);
    await api.post(`/api/moves/${move.id}/approve`).set('Cookie', committee.cookie);

    // Linked as in-laws, both ways.
    expect((await family(bride.cookie, bride.familyId)).links).toMatchObject([{ kind: 'inLaws', family: { headName: 'Rohit Wagh' } }]);
    expect((await family(groom.cookie, groom.familyId)).links).toMatchObject([{ kind: 'inLaws', family: { headName: 'Suresh Patil' } }]);

    // Her parents' page: married and moved, to which family.
    const parents = await family(visitor.cookie, bride.familyId);
    expect(parents.movedOut).toMatchObject([{ memberId: priyaId, name: 'Priya Patil', relation: 'daughter', family: { id: groom.familyId, headName: 'Rohit Wagh', canView: true } }]);
    // Her card in the new family: where she came from.
    const inLaws = await family(visitor.cookie, groom.familyId);
    expect(inLaws.members.find((m) => m.id === priyaId)?.movedFrom).toMatchObject({ id: bride.familyId, headName: 'Suresh Patil' });
    expect(inLaws.members.find((m) => m.name === 'Rohit Wagh')?.movedFrom).toBeUndefined();

    // Her parents' tree keeps her among their children, pointing to her new household.
    const tree = (await api.get(`/api/families/${bride.familyId}/tree`).set('Cookie', bride.cookie)).body.tree as FamilyTree;
    const home = tree.households.find((h) => h.family.id === bride.familyId);
    expect(home?.members.find((m) => m.id === priyaId)).toMatchObject({ relation: 'daughter', generation: 1, movedTo: { id: groom.familyId } });

    // Someone who asked not to be listed drops off for other families, but not for her parents.
    await MemberModel.updateOne({ _id: priyaId }, { $set: { listed: false } });
    expect((await family(visitor.cookie, bride.familyId)).movedOut).toEqual([]);
    expect((await family(bride.cookie, bride.familyId)).movedOut).toHaveLength(1);
  });

  it('accepts a link request already waiting between the two families instead of adding another', async () => {
    const { bride, groom, committee, priyaId } = await setup();
    await api.post('/api/links').set('Cookie', groom.cookie).send({ toFamilyId: bride.familyId, kind: 'relatives' });
    const move = (await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: priyaId, relation: 'daughterInLaw' })).body.move as MemberMoveView;
    await api.post(`/api/moves/${move.id}/agree`).set('Cookie', bride.cookie);
    await api.post(`/api/moves/${move.id}/approve`).set('Cookie', committee.cookie);
    expect((await family(groom.cookie, groom.familyId)).links).toMatchObject([{ kind: 'relatives' }]);
    expect((await requests(groom.cookie, groom.familyId)).outgoingLinks).toEqual([]);
  });

  it('can be declined by the old family, and withdrawn by the new one', async () => {
    const { bride, groom, priyaId } = await setup();
    const first = (await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: priyaId, relation: 'spouse' })).body.move as MemberMoveView;
    const declined = await api.post(`/api/moves/${first.id}/decline`).set('Cookie', bride.cookie).send({ reason: 'Wrong person' });
    expect(declined.body.move).toMatchObject({ status: 'declined', declineReason: 'Wrong person' });
    // The new family sees how it ended.
    expect((await requests(groom.cookie, groom.familyId)).movesIn).toMatchObject([{ status: 'declined' }]);

    const second = (await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: priyaId, relation: 'spouse' })).body.move as MemberMoveView;
    expect((await api.delete(`/api/moves/${second.id}`).set('Cookie', groom.cookie)).status).toBe(204);
    expect(String((await MemberModel.findById(priyaId).lean())?.familyId)).toBe(bride.familyId);
  });

  it('can say whose wife she will be, and sets it when the move is approved', async () => {
    const { bride, committee, priyaId } = await setup();
    const groom = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Anil Wagh' }, { name: 'Rohit Wagh', relation: 'son' }, { name: 'Sagar Wagh', relation: 'son' }] });
    const [anil, rohit] = groom.memberIds;
    // Her husband is one of the sons, not the head.
    const wrong = await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: priyaId, relation: 'daughterInLaw', partnerId: anil });
    expect(wrong.body.error.issues).toEqual([{ path: 'partnerId', message: 'validation.tieChoice' }]);
    const asked = await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: priyaId, relation: 'daughterInLaw', partnerId: rohit });
    const move = asked.body.move as MemberMoveView;
    expect(move.tie).toEqual({ kind: 'partner', name: 'Rohit Wagh' });
    await api.post(`/api/moves/${move.id}/agree`).set('Cookie', bride.cookie);
    await api.post(`/api/moves/${move.id}/approve`).set('Cookie', committee.cookie);
    const page = await family(groom.cookie, groom.familyId);
    expect(page.members.find((m) => m.id === priyaId)?.partnerId).toBe(rohit);
  });

  it("won't move a family head", async () => {
    const { bride, groom } = await setup();
    const headId = bride.memberIds[0];
    const res = await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: headId, relation: 'spouse' });
    expect(res.status).toBe(400);
    expect(res.body.error.issues).toEqual([{ path: 'memberId', message: 'validation.moveHead' }]);
  });
});
