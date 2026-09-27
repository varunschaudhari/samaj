import { type FamilyTree, INVERSE_LINK, type LinkKind, RELATION_GENERATION, TREE_DEPTH, TREE_MAX_HOUSEHOLDS, type TreeHousehold } from '@samaj/shared';
import { Types } from 'mongoose';
import { FamilyLinkModel } from '../models/family-link.model';
import { FamilyModel } from '../models/family.model';
import { MemberModel } from '../models/member.model';
import { notFound } from '../utils/app-error';
import { canEditFamily, canViewFamily, hasReach } from './access';
import { photoUrl } from './family.service';
import { familySummaries } from './links.service';
import type { Viewer } from './viewer';

/** Links that place a household in the tree, and the generation step each one takes. */
const STEP: Partial<Record<LinkKind, number>> = { parents: -1, children: 1, siblings: 0 };

/**
 * The tree around one family: walk accepted parents / children / siblings
 * links breadth first, up to TREE_DEPTH generations each way and
 * TREE_MAX_HOUSEHOLDS households. Each household's head sits at the
 * generation the walk reached it; its people are placed by relation.
 * In-laws and relatives of the root family come back separately.
 */
export async function getTree(viewer: Viewer, familyId: string): Promise<FamilyTree> {
  const gone = () => notFound('That family is no longer in the directory.');
  if (!Types.ObjectId.isValid(familyId)) throw gone();
  const root = await FamilyModel.findById(familyId, { history: 0 }).lean();
  if (!root || !canViewFamily(viewer, root)) throw gone();

  const placed = new Map<string, { generation: number; via: LinkKind | null }>([[familyId, { generation: 0, via: null }]]);
  const side: { kind: LinkKind; id: string }[] = [];
  let frontier = [familyId];
  let truncated = false;

  while (frontier.length > 0) {
    const ids = frontier.map((id) => new Types.ObjectId(id));
    const links = await FamilyLinkModel.find({ status: 'accepted', $or: [{ fromFamilyId: { $in: ids } }, { toFamilyId: { $in: ids } }] }).lean();
    const next: string[] = [];
    for (const link of links) {
      for (const [self, other, kind] of [
        [String(link.fromFamilyId), String(link.toFamilyId), link.kind],
        [String(link.toFamilyId), String(link.fromFamilyId), INVERSE_LINK[link.kind]],
      ] as const) {
        const at = frontier.includes(self) ? placed.get(self) : undefined;
        if (!at || placed.has(other)) continue;
        const step = STEP[kind];
        if (step === undefined) {
          // In-laws and relatives: listed beside the root family only.
          if (self === familyId && !side.some((s) => s.id === other)) side.push({ kind, id: other });
          continue;
        }
        const generation = at.generation + step;
        if (Math.abs(generation) > TREE_DEPTH) continue;
        if (placed.size >= TREE_MAX_HOUSEHOLDS) {
          truncated = true;
          continue;
        }
        placed.set(other, { generation, via: kind });
        next.push(other);
      }
    }
    frontier = next;
  }

  const allIds = [...placed.keys(), ...side.map((s) => s.id)];
  const [families, members, summaries] = await Promise.all([
    FamilyModel.find({ _id: { $in: allIds.map((id) => new Types.ObjectId(id)) } }, { history: 0 }).lean(),
    MemberModel.find({ familyId: { $in: [...placed.keys()].map((id) => new Types.ObjectId(id)) } })
      .sort({ isHead: -1, birthYear: 1, createdAt: 1 })
      .lean(),
    familySummaries(viewer, allIds),
  ]);
  const familyBy = new Map(families.map((f) => [String(f._id), f]));

  const households: TreeHousehold[] = [...placed.entries()].flatMap(([id, at]) => {
    const family = familyBy.get(id);
    const summary = summaries.get(id);
    // Only families the viewer could open anyway.
    if (!family || !summary?.canView) return [];
    const seesPending = canEditFamily(viewer, family) || hasReach(viewer, 'member:verify', family);
    return [
      {
        family: summary,
        generation: at.generation,
        via: at.via,
        members: members
          .filter((m) => String(m.familyId) === id && (seesPending || m.approval !== 'pending'))
          .map((m) => ({
            id: String(m._id),
            name: m.name,
            relation: m.relation,
            gender: m.gender,
            birthYear: m.birthYear ?? null,
            photoUrl: photoUrl(m),
            isHead: m.isHead,
            generation: at.generation + RELATION_GENERATION[m.relation],
          })),
      },
    ];
  });

  return {
    rootId: familyId,
    households,
    side: side.flatMap((s) => {
      const summary = summaries.get(s.id);
      return summary?.canView ? [{ kind: s.kind, family: summary }] : [];
    }),
    truncated,
  };
}
