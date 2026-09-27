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
});
