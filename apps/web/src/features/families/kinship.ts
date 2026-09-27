import type { TreePerson } from '@samaj/shared';
import type { MessageKey } from '@/i18n';

type Step = 'U' | 'D' | 'P';
interface Hop {
  step: Step;
  to: TreePerson;
}

const male = (p: TreePerson) => p.gender !== 'female';
const pick = (p: TreePerson, m: MessageKey, f: MessageKey) => (male(p) ? m : f);

/**
 * Walk from one person to another over the tree's joins, up to a parent (U),
 * down to a child (D) or across to a partner (P), and tidy the walk: a
 * parent's partner is a parent too (U P → U), a partner's child a child
 * (P D → D). What's left, with the people it passes, names the relation.
 */
function classify(path: Hop[], ego: TreePerson): MessageKey {
  // A line across a generation nobody listed (grandparents but no father) is two steps, through an unlisted father:
  // one per ancestor and generation, so a head and his brother joined to the same grandfather share him.
  const expanded: Hop[] = [];
  let from = ego;
  for (const hop of path) {
    if (hop.step !== 'P' && Math.abs(from.generation - hop.to.generation) > 1) {
      const top = hop.step === 'U' ? hop.to : from;
      const between = (g: number): TreePerson => ({ ...top, id: `${top.id}~${g}`, name: '', gender: 'male', generation: g, parentId: null, partnerId: null });
      if (hop.step === 'U') for (let g = from.generation - 1; g > hop.to.generation; g--) expanded.push({ step: 'U', to: between(g) });
      else for (let g = from.generation + 1; g < hop.to.generation; g++) expanded.push({ step: 'D', to: between(g) });
    }
    expanded.push(hop);
    from = hop.to;
  }
  let hops = expanded;
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i + 1 < hops.length; i++) {
      const [a, b] = [hops[i] as Hop, hops[i + 1] as Hop];
      // Up and straight back down to the same person: no step at all.
      if (a.step === 'U' && b.step === 'D' && b.to.id === (i === 0 ? ego : (hops[i - 1] as Hop).to).id) {
        hops = [...hops.slice(0, i), ...hops.slice(i + 2)];
        changed = true;
        break;
      }
      if ((a.step === 'U' && b.step === 'P') || (a.step === 'P' && b.step === 'D')) {
        hops = [...hops.slice(0, i), { step: a.step === 'U' ? 'U' : 'D', to: b.to }, ...hops.slice(i + 2)];
        changed = true;
        break;
      }
    }
  }
  const steps = hops.map((h) => h.step).join('');
  const node = (i: number) => (hops[i] as Hop).to;
  const them = hops.length ? node(hops.length - 1) : ego;
  const paternal = hops.length > 0 && male(node(0));
  switch (steps) {
    case '':
      return 'kin.self';
    case 'U':
      return pick(them, 'kin.father', 'kin.mother');
    case 'UU':
      return pick(them, 'kin.grandfather', 'kin.grandmother');
    case 'UUU':
      return pick(them, 'kin.greatGrandfather', 'kin.greatGrandmother');
    case 'D':
      return pick(them, 'kin.son', 'kin.daughter');
    case 'DD':
      return pick(them, 'kin.grandson', 'kin.granddaughter');
    case 'DDD':
      return pick(them, 'kin.greatGrandson', 'kin.greatGranddaughter');
    case 'P':
      return them.formerPartner || ego.formerPartner ? pick(them, 'kin.formerHusband', 'kin.formerWife') : pick(them, 'kin.husband', 'kin.wife');
    case 'UD':
      return pick(them, 'kin.brother', 'kin.sister');
    case 'UDD':
      return male(node(1)) ? pick(them, 'kin.brothersSon', 'kin.brothersDaughter') : pick(them, 'kin.sistersSon', 'kin.sistersDaughter');
    case 'UDP':
      return male(node(1)) ? 'kin.brothersWife' : 'kin.sistersHusband';
    case 'UUD':
      return paternal ? pick(them, 'kin.paternalUncle', 'kin.paternalAunt') : pick(them, 'kin.maternalUncle', 'kin.maternalAunt');
    case 'UUDP':
      if (paternal) return male(node(2)) ? 'kin.paternalUncleWife' : 'kin.paternalAuntHusband';
      return male(node(2)) ? 'kin.maternalUncleWife' : 'kin.maternalAuntHusband';
    case 'UUDD': {
      const side = `${paternal ? 'f' : 'm'}${male(node(2)) ? 'b' : 's'}`;
      return `kin.cousin.${side}.${male(them) ? 'm' : 'f'}` as MessageKey;
    }
    case 'DP':
      return male(node(0)) ? 'kin.sonsWife' : 'kin.daughtersHusband';
    case 'DDP':
      return male(node(1)) ? 'kin.grandsonsWife' : 'kin.granddaughtersHusband';
    case 'PU':
      return pick(them, 'kin.fatherInLaw', 'kin.motherInLaw');
    case 'PUU':
      return pick(them, 'kin.grandfatherInLaw', 'kin.grandmotherInLaw');
    case 'PUD':
      return male(node(0)) ? pick(them, 'kin.husbandsBrother', 'kin.husbandsSister') : pick(them, 'kin.wifesBrother', 'kin.wifesSister');
    case 'PUDP':
      if (male(node(0))) return male(node(2)) ? 'kin.husbandsBrothersWife' : 'kin.husbandsSistersHusband';
      return male(node(2)) ? 'kin.wifesBrothersWife' : 'kin.wifesSistersHusband';
    case 'PUDD':
      // A husband's brother's children are पुतण्या / पुतणी; the other in-laws' are भाचा / भाची.
      return male(node(0)) && male(node(2)) ? pick(them, 'kin.husbandsBrothersSon', 'kin.husbandsBrothersDaughter') : pick(them, 'kin.inLawsSiblingsSon', 'kin.inLawsSiblingsDaughter');
    default:
      return 'kin.relative';
  }
}

/** Everyone's relation to `egoId`, as a message key, over the tree's parent and partner joins. People not joined to them are left out. */
export function kinshipFrom(egoId: string, people: TreePerson[]): Map<string, MessageKey> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const ego = byId.get(egoId);
  if (!ego) return new Map();
  const hops = new Map<string, Hop[]>();
  const add = (from: string, step: Step, to: TreePerson) => hops.set(from, [...(hops.get(from) ?? []), { step, to }]);
  for (const p of people) {
    const parent = p.parentId ? byId.get(p.parentId) : undefined;
    if (parent) {
      add(p.id, 'U', parent);
      add(parent.id, 'D', p);
    }
    const partner = p.partnerId ? byId.get(p.partnerId) : undefined;
    if (partner) {
      add(p.id, 'P', partner);
      add(partner.id, 'P', p);
    }
  }
  // Breadth first, so each relation is named by the shortest way to them.
  const came = new Map<string, { from: string; hop: Hop }>();
  const seen = new Set([egoId]);
  const queue = [egoId];
  while (queue.length) {
    const at = queue.shift() as string;
    for (const hop of hops.get(at) ?? []) {
      if (seen.has(hop.to.id)) continue;
      seen.add(hop.to.id);
      came.set(hop.to.id, { from: at, hop });
      queue.push(hop.to.id);
    }
  }
  const out = new Map<string, MessageKey>([[egoId, 'kin.self']]);
  for (const id of came.keys()) {
    const path: Hop[] = [];
    for (let at = id; at !== egoId; ) {
      const step = came.get(at);
      if (!step) break;
      path.unshift(step.hop);
      at = step.from;
    }
    out.set(id, classify(path, ego));
  }
  return out;
}
