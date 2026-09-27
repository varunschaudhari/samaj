import type { FamilyTree, LinkKind } from '@samaj/shared';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FamilyLinkModel, linkPair } from '../src/models/family-link.model';
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
