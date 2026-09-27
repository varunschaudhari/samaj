import type { FamilyDetail, FamilyTree, LinkKind, TreePerson } from '@samaj/shared';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FamilyLinkModel, linkPair } from '../src/models/family-link.model';
import { MemberModel } from '../src/models/member.model';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
});

/** "to is from's <kind>". */
const link = (from: string, to: string, kind: LinkKind, status: 'accepted' | 'pending' = 'accepted') =>
  FamilyLinkModel.create({ fromFamilyId: from, toFamilyId: to, kind, status, pair: linkPair(from, to), requestedByUserId: new Types.ObjectId(), requestedByName: 'x' });

const tree = async (cookie: string, id: string) => (await api.get(`/api/families/${id}/tree`).set('Cookie', cookie)).body.tree as FamilyTree;
const everyone = (t: FamilyTree) => t.households.flatMap((h) => h.members);
const byName = (t: FamilyTree) => new Map(everyone(t).map((p) => [p.name, p] as const));
const idOf = (t: FamilyTree, name: string) => byName(t).get(name)?.id;
const parentOf = (t: FamilyTree, name: string) => everyone(t).find((p) => p.id === byName(t).get(name)?.parentId)?.name ?? null;
const count = (t: FamilyTree, name: string) => everyone(t).filter((p) => p.name === name).length;

describe('GET /api/families/:id/tree', () => {
  it('places linked households and their people by generation', async () => {
    const grand = await createFamily(branches.bhusawal, { people: [{ name: 'Ganpat Wagh' }] });
    const parents = await createFamily(branches.bhusawal, { people: [{ name: 'Anil Wagh' }, { name: 'Sunita Wagh', relation: 'spouse', gender: 'female' }, { name: 'Sagar Wagh', relation: 'son' }] });
    const root = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Rohit Wagh' }, { name: 'Priya Wagh', relation: 'spouse', gender: 'female' }] });
    const sibling = await createFamily(branches.amalner, { people: [{ name: 'Amit Wagh' }] });
    const child = await createFamily(branches.amalner, { people: [{ name: 'Om Wagh' }] });
    const inLaws = await createFamily(branches.pune, { people: [{ name: 'Suresh Patil' }] });
    const waiting = await createFamily(branches.pune, { people: [{ name: 'Not Yet' }] });

    await link(root.familyId, parents.familyId, 'parents');
    await link(parents.familyId, grand.familyId, 'parents');
    await link(root.familyId, sibling.familyId, 'siblings');
    // Proposed from the child's side: the root is the child's parents' family.
    await link(child.familyId, root.familyId, 'parents');
    await link(root.familyId, inLaws.familyId, 'inLaws');
    await link(root.familyId, waiting.familyId, 'relatives', 'pending');

    const t = await tree(root.cookie, root.familyId);
    const at = Object.fromEntries(t.households.map((h) => [h.family.headName, { generation: h.generation, via: h.via }]));
    expect(at).toEqual({
      'Rohit Wagh': { generation: 0, via: null },
      'Anil Wagh': { generation: -1, via: 'parents' },
      'Ganpat Wagh': { generation: -2, via: 'parents' },
      'Amit Wagh': { generation: 0, via: 'siblings' },
      'Om Wagh': { generation: 1, via: 'children' },
    });
    // A son still living with the parents is in the root's own generation.
    const people = Object.fromEntries(t.households.flatMap((h) => h.members.map((m) => [m.name, m.generation])));
    expect(people).toMatchObject({ 'Sagar Wagh': 0, 'Sunita Wagh': -1, 'Priya Wagh': 0 });
    // In-laws sit beside the tree; pending links aren't in it at all.
    expect(t.side).toMatchObject([{ kind: 'inLaws', family: { headName: 'Suresh Patil' } }]);
    expect(t.truncated).toBe(false);
    // No phone numbers in the tree.
    expect(JSON.stringify(t)).not.toContain('+91');

    // Person to person: each head hangs from the head of the family it was linked from.
    const who = byName(t);
    const parentName = (name: string) => everyone(t).find((p) => p.id === who.get(name)?.parentId)?.name ?? null;
    expect(parentName('Rohit Wagh')).toBe('Anil Wagh');
    expect(parentName('Anil Wagh')).toBe('Ganpat Wagh');
    expect(parentName('Sagar Wagh')).toBe('Anil Wagh');
    // A brother's family shares the parents.
    expect(parentName('Amit Wagh')).toBe('Anil Wagh');
    expect(parentName('Om Wagh')).toBe('Rohit Wagh');
    expect(who.get('Priya Wagh')?.partnerId).toBe(idOf(t, 'Rohit Wagh'));
    expect(who.get('Sunita Wagh')?.partnerId).toBe(idOf(t, 'Anil Wagh'));
  });

  it('joins people within a household: whose child, whose wife, and adoption only for the family', async () => {
    const own = await createFamily(branches.bhusawal, {
      account: 'member',
      people: [{ name: 'Anil Wagh' }, { name: 'Sunita Wagh', relation: 'spouse', gender: 'female' }, { name: 'Rohit Wagh', relation: 'son' }, { name: 'Sagar Wagh', relation: 'son' }],
    });
    const [, sunita, rohit, sagar] = own.memberIds;
    const committee = await createFamily(branches.district, { account: 'committee' });
    const visitor = await createFamily(branches.bhusawal, { account: 'member' });
    const add = (body: Record<string, unknown>) =>
      api.post(`/api/families/${own.familyId}/members`).set('Cookie', committee.cookie).send({ gender: 'male', consent: true, ...body });

    expect((await add({ name: 'Kavya Wagh', relation: 'daughterInLaw', gender: 'female', partnerId: rohit })).status).toBe(201);
    expect((await add({ name: 'Neha Wagh', relation: 'daughterInLaw', gender: 'female', partnerId: sagar })).status).toBe(201);
    expect((await add({ name: 'Aarav Wagh', relation: 'grandson', parentId: rohit })).status).toBe(201);
    expect((await add({ name: 'Isha Wagh', relation: 'granddaughter', gender: 'female', parentId: sagar, adopted: true })).status).toBe(201);
    // Two sons and nobody said whose: not guessed.
    expect((await add({ name: 'Dev Wagh', relation: 'grandson' })).status).toBe(201);

    // A grandchild's parent is a son or daughter of this family, nobody else.
    const wrong = await add({ name: 'X Wagh', relation: 'grandson', parentId: sunita });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.issues).toEqual([{ path: 'parentId', message: 'validation.tieChoice' }]);
    expect((await add({ name: 'X Wagh', relation: 'grandson', parentId: visitor.memberIds[0] })).status).toBe(400);

    const t = await tree(own.cookie, own.familyId);
    const who = byName(t);
    expect(who.get('Aarav Wagh')).toMatchObject({ parentId: rohit, generation: 2 });
    expect(who.get('Isha Wagh')).toMatchObject({ parentId: sagar, adopted: true });
    expect(who.get('Dev Wagh')?.parentId).toBeNull();
    expect(who.get('Kavya Wagh')?.partnerId).toBe(rohit);
    expect(who.get('Neha Wagh')?.partnerId).toBe(sagar);
    expect(who.get('Rohit Wagh')?.parentId).toBe(own.memberIds[0]);

    // Others see a granddaughter, not that she was adopted.
    const seen = byName(await tree(visitor.cookie, own.familyId)).get('Isha Wagh') as TreePerson;
    expect(seen).toMatchObject({ parentId: sagar });
    expect(seen).not.toHaveProperty('adopted');
    const page = (await api.get(`/api/families/${own.familyId}`).set('Cookie', visitor.cookie)).body.family as FamilyDetail;
    expect(page.members.find((m) => m.name === 'Isha Wagh')).not.toHaveProperty('adopted');

    // Sagar leaves the list: nobody is his child or wife any more.
    expect((await api.delete(`/api/families/${own.familyId}/members/${sagar}`).set('Cookie', own.cookie)).status).toBe(200);
    expect(await MemberModel.findOne({ name: 'Isha Wagh' }).lean()).toMatchObject({ parentId: null });
    expect(await MemberModel.findOne({ name: 'Neha Wagh' }).lean()).toMatchObject({ partnerId: null });
  });

  it('shows someone listed in two linked households once', async () => {
    const parents = await createFamily(branches.bhusawal, {
      people: [{ name: 'Anil Wagh' }, { name: 'Rohit Wagh', relation: 'son', birthYear: 1990 }, { name: 'Om Wagh', relation: 'grandson' }],
    });
    // Rohit set up his own household and still lists his father; his son is in both.
    const own = await createFamily(branches.amalner, {
      account: 'member',
      people: [{ name: 'Rohit Anil Wagh', birthYear: 1990 }, { name: 'Anil Wagh', relation: 'father' }, { name: 'Om Wagh', relation: 'son' }],
    });
    await link(own.familyId, parents.familyId, 'parents');

    const t = await tree(own.cookie, own.familyId);
    expect(everyone(t).map((p) => p.name).sort()).toEqual(['Anil Wagh', 'Om Wagh', 'Rohit Anil Wagh']);
    const who = byName(t);
    expect(who.get('Rohit Anil Wagh')?.parentId).toBe(parents.memberIds[0]);
    expect(who.get('Om Wagh')?.parentId).toBe(own.memberIds[0]);
  });

  it('stops three generations out', async () => {
    const chain = [];
    for (let i = 0; i < 5; i++) chain.push(await createFamily(branches.amalner, { people: [{ name: `Gen ${i}` }] }));
    for (let i = 0; i < 4; i++) await link(chain[i]?.familyId ?? '', chain[i + 1]?.familyId ?? '', 'parents');
    const viewer = await createFamily(branches.amalner, { account: 'member' });
    const t = await tree(viewer.cookie, chain[0]?.familyId ?? '');
    expect(t.households.map((h) => h.family.headName).sort()).toEqual(['Gen 0', 'Gen 1', 'Gen 2', 'Gen 3']);
  });

  it('is only for people who may see the family', async () => {
    const root = await createFamily(branches.amalner);
    const waiting = await createFamily(branches.amalner, { status: 'pending', account: 'member' });
    expect((await api.get(`/api/families/${root.familyId}/tree`).set('Cookie', waiting.cookie)).status).toBe(404);
  });

  it('lets a family say whose child its head is in the linked home, instead of guessing the head there', async () => {
    const home = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Sunil Wagh' }, { name: 'Anil Wagh', relation: 'brother' }] });
    const own = await createFamily(branches.amalner, {
      account: 'member',
      people: [{ name: 'Rohit Wagh' }, { name: 'Priya Wagh', relation: 'spouse', gender: 'female' }, { name: 'Om Wagh', relation: 'son' }],
    });
    const stranger = await createFamily(branches.pune, { people: [{ name: 'Someone Else' }] });
    await link(own.familyId, home.familyId, 'parents');
    const [rohit, , om] = own.memberIds;
    const set = (memberId: string | undefined, parent: string | null | undefined) =>
      api.put(`/api/families/${own.familyId}/members/${memberId}/parent`).set('Cookie', own.cookie).send({ memberId: parent });

    // Guessed: the head of the linked home.
    expect(parentOf(await tree(own.cookie, own.familyId), 'Rohit Wagh')).toBe('Sunil Wagh');
    expect((await set(rohit, home.memberIds[1])).status).toBe(200);
    expect(parentOf(await tree(own.cookie, own.familyId), 'Rohit Wagh')).toBe('Anil Wagh');
    const page = (await api.get(`/api/families/${own.familyId}`).set('Cookie', own.cookie)).body.family as FamilyDetail;
    expect(page.members.find((m) => m.id === rohit)?.externalParent).toMatchObject({ name: 'Anil Wagh', family: { headName: 'Sunil Wagh' } });

    // Only in a family linked to theirs, and not for the family's own children.
    const unlinked = await set(rohit, stranger.memberIds[0]);
    expect(unlinked.status).toBe(409);
    expect(unlinked.body.error.issues).toEqual([{ path: 'memberId', message: 'validation.parentNotLinked' }]);
    expect((await set(om, home.memberIds[1])).status).toBe(400);
    // And only by the family itself.
    expect((await api.put(`/api/families/${own.familyId}/members/${rohit}/parent`).set('Cookie', home.cookie).send({ memberId: null })).status).toBe(403);

    expect((await set(rohit, null)).status).toBe(200);
    expect(parentOf(await tree(own.cookie, own.familyId), 'Rohit Wagh')).toBe('Sunil Wagh');
  });

  it('draws a wife’s माहेर from the move that brought her, and shows her once', async () => {
    const bride = await createFamily(branches.bhusawal, {
      account: 'member',
      people: [{ name: 'Suresh Patil' }, { name: 'Priya Patil', relation: 'daughter', gender: 'female' }, { name: 'Amol Patil', relation: 'son' }],
    });
    const groom = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Rohit Wagh' }] });
    const committee = await createFamily(branches.district, { account: 'committee' });
    const move = (await api.post('/api/moves').set('Cookie', groom.cookie).send({ memberId: bride.memberIds[1], relation: 'spouse' })).body.move as { id: string };
    await api.post(`/api/moves/${move.id}/agree`).set('Cookie', bride.cookie);
    await api.post(`/api/moves/${move.id}/approve`).set('Cookie', committee.cookie);

    const t = await tree(groom.cookie, groom.familyId);
    const maher = t.households.find((h) => h.family.id === bride.familyId);
    expect(maher).toMatchObject({ via: 'person', generation: -1, through: { name: 'Priya Patil' } });
    expect(parentOf(t, 'Priya Patil')).toBe('Suresh Patil');
    expect(byName(t).get('Priya Patil')?.partnerId).toBe(groom.memberIds[0]);
    expect(parentOf(t, 'Amol Patil')).toBe('Suresh Patil');
    expect(count(t, 'Priya Patil')).toBe(1);
    // Drawn in the tree, so not listed again beside it.
    expect(t.side).toEqual([]);
  });

  it('follows the family’s word on who is the same person', async () => {
    const own = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Rohit Wagh' }, { name: 'Amit Wagh', relation: 'brother' }, { name: 'Sunil Wagh', relation: 'brother' }] });
    const amit = await createFamily(branches.amalner, { people: [{ name: 'Amit Wagh' }] });
    const sunil = await createFamily(branches.amalner, { people: [{ name: 'Sunilkumar Wagh' }] });
    const visitor = await createFamily(branches.amalner, { account: 'member' });
    await link(own.familyId, amit.familyId, 'siblings');
    await link(own.familyId, sunil.familyId, 'siblings');
    const say = (cookie: string, a: string | undefined, b: string | undefined, same: boolean) => api.put('/api/people/same').set('Cookie', cookie).send({ a, b, same });

    // Guessed: Amit is one person, Sunil and Sunilkumar two.
    let t = await tree(own.cookie, own.familyId);
    expect(count(t, 'Amit Wagh')).toBe(1);
    expect(byName(t).get('Amit Wagh')?.alsoListed).toEqual([{ memberId: own.memberIds[1], familyId: own.familyId, headName: 'Rohit Wagh' }]);
    expect(everyone(t).map((p) => p.name)).toEqual(expect.arrayContaining(['Sunil Wagh', 'Sunilkumar Wagh']));

    expect((await say(visitor.cookie, own.memberIds[1], amit.memberIds[0], false)).status).toBe(403);
    expect((await say(own.cookie, own.memberIds[1], amit.memberIds[0], false)).status).toBe(204);
    expect((await say(own.cookie, own.memberIds[2], sunil.memberIds[0], true)).status).toBe(204);
    t = await tree(own.cookie, own.familyId);
    expect(count(t, 'Amit Wagh')).toBe(2);
    expect(everyone(t).map((p) => p.name)).not.toContain('Sunil Wagh');
    expect(byName(t).get('Sunilkumar Wagh')?.parentId).toBeNull();

    // Back to the guess.
    expect((await api.delete(`/api/people/same/${own.memberIds[1]}/${amit.memberIds[0]}`).set('Cookie', own.cookie)).status).toBe(204);
    expect(count(await tree(own.cookie, own.familyId), 'Amit Wagh')).toBe(1);
  });

  it('places the mother’s side and a grandson’s wife', async () => {
    const maher = await createFamily(branches.bhusawal, { people: [{ name: 'Suresh Patil' }] });
    const own = await createFamily(branches.amalner, {
      account: 'member',
      people: [
        { name: 'Rohit Wagh' },
        { name: 'Sunita Wagh', relation: 'mother', gender: 'female' },
        { name: 'Mahesh Patil', relation: 'maternalUncle' },
        { name: 'Vaishali Patil', relation: 'maternalUncleWife', gender: 'female' },
        { name: 'Om Wagh', relation: 'son' },
        { name: 'Aarav Wagh', relation: 'grandson' },
        { name: 'Neha Wagh', relation: 'granddaughterInLaw', gender: 'female' },
      ],
    });
    await link(own.familyId, maher.familyId, 'inLaws');
    await api.put(`/api/families/${own.familyId}/members/${own.memberIds[1]}/parent`).set('Cookie', own.cookie).send({ memberId: maher.memberIds[0] });

    const t = await tree(own.cookie, own.familyId);
    const who = byName(t);
    // Sunita's father, drawn from her माहेर; her brother shares him.
    expect(parentOf(t, 'Sunita Wagh')).toBe('Suresh Patil');
    expect(parentOf(t, 'Mahesh Patil')).toBe('Suresh Patil');
    expect(who.get('Mahesh Patil')?.generation).toBe(-1);
    expect(who.get('Vaishali Patil')?.partnerId).toBe(who.get('Mahesh Patil')?.id);
    expect(who.get('Neha Wagh')).toMatchObject({ generation: 2, partnerId: who.get('Aarav Wagh')?.id });
  });

  it('keeps a second marriage apart: a former wife, and whose child each child is', async () => {
    const own = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Anil Wagh' }] });
    const add = (body: Record<string, unknown>) => api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send({ gender: 'male', consent: true, ...body });
    const first = (await add({ name: 'Sunita Wagh', relation: 'spouse', gender: 'female', formerPartner: true })).body.family as FamilyDetail;
    const sunita = first.members.find((m) => m.name === 'Sunita Wagh');
    expect(sunita?.formerPartner).toBe(true);
    const second = ((await add({ name: 'Meena Wagh', relation: 'spouse', gender: 'female' })).body.family as FamilyDetail).members.find((m) => m.name === 'Meena Wagh');
    expect((await add({ name: 'Rohit Wagh', relation: 'son', otherParentId: sunita?.id })).status).toBe(201);
    expect((await add({ name: 'Om Wagh', relation: 'son', otherParentId: second?.id })).status).toBe(201);
    // The other parent is someone who married into the family.
    const wrong = await add({ name: 'X Wagh', relation: 'son', otherParentId: own.memberIds[0] });
    expect(wrong.body.error.issues).toEqual([{ path: 'otherParentId', message: 'validation.tieChoice' }]);

    const t = await tree(own.cookie, own.familyId);
    const who = byName(t);
    expect(who.get('Sunita Wagh')).toMatchObject({ partnerId: own.memberIds[0], formerPartner: true });
    expect(who.get('Meena Wagh')).toMatchObject({ partnerId: own.memberIds[0], formerPartner: false });
    expect(who.get('Rohit Wagh')).toMatchObject({ parentId: own.memberIds[0], otherParentId: sunita?.id });
    expect(who.get('Om Wagh')?.otherParentId).toBe(second?.id);
  });

  it('says in the family history exactly what an edit changed', async () => {
    const own = await createFamily(branches.amalner, { account: 'member', status: 'pending', people: [{ name: 'Anil Wagh' }, { name: 'Rohit Wagh', relation: 'son' }, { name: 'Sagar Wagh', relation: 'son' }] });
    const [, rohit, sagar] = own.memberIds;
    const added = (await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send({ name: 'Aarav Wagh', relation: 'grandson', gender: 'male', parentId: rohit, consent: true }))
      .body.family as FamilyDetail;
    const aarav = added.members.find((m) => m.name === 'Aarav Wagh')?.id;
    const edit = (body: Record<string, unknown>) =>
      api.put(`/api/families/${own.familyId}/members/${aarav}`).set('Cookie', own.cookie).send({ name: 'Aarav Wagh', relation: 'grandson', gender: 'male', ...body });
    const history = async () => ((await api.get(`/api/families/${own.familyId}`).set('Cookie', own.cookie)).body.family as FamilyDetail).history ?? [];

    await edit({ birthYear: '2020', parentId: sagar });
    expect((await history())[0]?.note).toBe('Updated Aarav Wagh: birth year, parent (Sagar Wagh)');
    const entries = (await history()).length;
    // The same again: nothing changed, nothing recorded.
    await edit({ birthYear: '2020', parentId: sagar });
    expect(await history()).toHaveLength(entries);
  });
});
