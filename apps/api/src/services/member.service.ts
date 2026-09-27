import { nameKey, type Member, type MemberPage, type memberListQuerySchema } from '@samaj/shared';
import { type QueryFilter, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { type MemberDoc, MemberModel } from '../models/member.model';
import { AppError } from '../utils/app-error';
import { searchWords } from '../models/plugins';
import { cappedCount } from '../utils/count';
import { canBrowseDirectory, canSeePhone } from './access';
import { inBranch } from './audience';
import { photoUrl } from './family.service';
import type { Viewer } from './viewer';

type ListQuery = z.output<typeof memberListQuerySchema>;

export const notVerified = () =>
  new AppError(403, 'NOT_VERIFIED', 'Your family is waiting for the branch committee to verify it. The directory opens once they do.');

function encodeCursor(member: Pick<MemberDoc, 'name' | '_id'>): string {
  return Buffer.from(JSON.stringify([member.name, String(member._id)])).toString('base64url');
}

function decodeCursor(cursor: string): { name: string; id: Types.ObjectId } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string' && Types.ObjectId.isValid(parsed[1])) {
      return { name: parsed[0], id: new Types.ObjectId(parsed[1]) };
    }
  } catch {
    // fall through
  }
  throw new AppError(400, 'VALIDATION_FAILED', 'The page link is invalid. Reload the directory.');
}

/** The directory: people from verified families only. */
export async function listMembers(viewer: Viewer, query: ListQuery): Promise<MemberPage> {
  if (!canBrowseDirectory(viewer)) throw notVerified();

  // People who asked not to be listed stay out of the directory.
  // So do people who have passed away: they live on in their family's page and tree.
  const conditions: QueryFilter<MemberDoc>[] = [{ familyStatus: 'verified' }, { listed: { $ne: false } }, { deceased: { $ne: true } }];
  // A district includes every city and town under it.
  if (query.branchId) conditions.push(inBranch(query.branchId));
  if (query.gotra) conditions.push({ gotra: query.gotra });
  if (query.q) {
    // Every word typed must start a word of the name, place or occupation, so
    // "sun cha" finds "Sunita Chaudhari". Indexed prefix tokens, not a regex.
    for (const word of searchWords(query.q)) {
      // Also by the name's key: रोहित finds Rohit, Chaudhary finds Choudhari, and a maiden name finds her.
      const key = nameKey(word);
      conditions.push({ $or: [{ nameTokens: word }, { placeTokens: word }, { occupationTokens: word }, ...(key ? [{ keyTokens: key }] : [])] });
    }
  }

  const baseFilter: QueryFilter<MemberDoc> = { $and: conditions };
  const pageFilter: QueryFilter<MemberDoc> = { $and: [...conditions] };
  if (query.cursor) {
    const after = decodeCursor(query.cursor);
    pageFilter.$and?.push({ $or: [{ name: { $gt: after.name } }, { name: after.name, _id: { $gt: after.id } }] });
  }

  const [docs, total] = await Promise.all([
    MemberModel.find(pageFilter).sort({ name: 1, _id: 1 }).limit(query.limit + 1).lean(),
    cappedCount(MemberModel, baseFilter),
  ]);

  const hasMore = docs.length > query.limit;
  const pageDocs = hasMore ? docs.slice(0, query.limit) : docs;

  const familyIds = [...new Set(pageDocs.map((m) => String(m.familyId)))];
  const branchIds = [...new Set(pageDocs.map((m) => String(m.branchId)))];
  const [heads, branches] = await Promise.all([
    MemberModel.find({ familyId: { $in: familyIds }, isHead: true }, { familyId: 1, name: 1 }).lean(),
    BranchModel.find({ _id: { $in: branchIds } }).lean(),
  ]);
  const headByFamily = new Map(heads.map((h) => [String(h.familyId), h.name]));
  const branchById = new Map(branches.map((b) => [String(b._id), b]));

  const items: Member[] = pageDocs.map((m) => {
    const branch = branchById.get(String(m.branchId));
    const item: Member = {
      id: String(m._id),
      familyId: String(m.familyId),
      name: m.name,
      relation: m.relation,
      familyHead: headByFamily.get(String(m.familyId)) ?? null,
      gotra: m.gotra ?? null,
      place: m.place,
      occupation: m.occupation ?? null,
      branch: { id: String(m.branchId), name: branch?.name ?? '', nameMr: branch?.nameMr ?? '' },
      photoUrl: photoUrl(m),
    };
    if (m.phone && canSeePhone(viewer, m)) item.phone = m.phone;
    return item;
  });

  const last = pageDocs.at(-1);
  return { items, total, nextCursor: hasMore && last ? encodeCursor(last) : null };
}
