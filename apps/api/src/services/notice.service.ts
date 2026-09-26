import { MAX_PINNED_NOTICES, type Notice, type NoticeFeed, type noticeInputSchema, type noticeListQuerySchema } from '@samaj/shared';
import { type QueryFilter, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { type NoticeDoc, NoticeModel } from '../models/notice.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { hasReach } from './access';
import { branchAudience } from './audience';
import type { Viewer } from './viewer';

type Input = z.output<typeof noticeInputSchema>;
type ListQuery = z.output<typeof noticeListQuerySchema>;

const noticeGone = () => notFound('That notice is no longer available.');

async function toNotices(viewer: Viewer, docs: NoticeDoc[]): Promise<Notice[]> {
  const branches = await BranchModel.find({ _id: { $in: docs.map((d) => d.branchId) } }).lean();
  const branchBy = new Map(branches.map((b) => [String(b._id), b]));
  return docs.map((d) => {
    const b = branchBy.get(String(d.branchId));
    return {
      id: String(d._id),
      title: d.title,
      body: d.body,
      kind: d.kind,
      pinned: d.pinned,
      branch: { id: String(d.branchId), name: b?.name ?? '', nameMr: b?.nameMr ?? '' },
      authorName: d.authorName,
      publishedAt: d.publishedAt.toISOString(),
      editedAt: d.editedAt ? d.editedAt.toISOString() : null,
      permissions: { canEdit: hasReach(viewer, 'notice:publish', d) },
    };
  });
}

function encodeCursor(d: Pick<NoticeDoc, 'publishedAt' | '_id'>) {
  return Buffer.from(JSON.stringify([d.publishedAt.toISOString(), String(d._id)])).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: Types.ObjectId } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string' && Types.ObjectId.isValid(parsed[1])) {
      return { at: new Date(parsed[0]), id: new Types.ObjectId(parsed[1]) };
    }
  } catch {
    // fall through
  }
  throw new AppError(400, 'VALIDATION_FAILED', 'The page link is invalid. Reload the notices.');
}

/** Pinned notices first (on the first page only), then newest first. */
export async function listNotices(viewer: Viewer, query: ListQuery): Promise<NoticeFeed> {
  const conditions: QueryFilter<NoticeDoc>[] = [{ removedAt: null }, branchAudience(viewer) as QueryFilter<NoticeDoc>];
  if (query.kind) conditions.push({ kind: query.kind });

  const page: QueryFilter<NoticeDoc>[] = [...conditions, { pinned: false }];
  if (query.cursor) {
    const after = decodeCursor(query.cursor);
    page.push({ $or: [{ publishedAt: { $lt: after.at } }, { publishedAt: after.at, _id: { $lt: after.id } }] });
  }

  const [pinned, docs] = await Promise.all([
    query.cursor ? Promise.resolve([]) : NoticeModel.find({ $and: [...conditions, { pinned: true }] }).sort({ publishedAt: -1 }).limit(MAX_PINNED_NOTICES * 4).lean(),
    NoticeModel.find({ $and: page }).sort({ publishedAt: -1, _id: -1 }).limit(query.limit + 1).lean(),
  ]);
  const hasMore = docs.length > query.limit;
  const items = hasMore ? docs.slice(0, query.limit) : docs;
  const last = items.at(-1);
  return {
    pinned: await toNotices(viewer, pinned),
    items: await toNotices(viewer, items),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

async function targetBranch(viewer: Viewer, branchId: string) {
  const branch = await BranchModel.findById(branchId).lean();
  if (!branch) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Pick a branch from the list.', [{ path: 'branchId', message: 'validation.branchRequired' }]);
  }
  const placed = { branchId: branch._id, branchAncestors: branch.ancestors };
  if (!hasReach(viewer, 'notice:publish', placed)) {
    throw new AppError(403, 'FORBIDDEN', 'You can post only to your own branch and the towns under it.', [
      { path: 'branchId', message: 'validation.noticeBranch' },
    ]);
  }
  return branch;
}

/** A branch can pin a handful of notices, so pinning keeps its meaning. */
async function assertPinRoom(branchId: Types.ObjectId, exceptId?: Types.ObjectId) {
  const pinnedCount = await NoticeModel.countDocuments({ branchId, pinned: true, removedAt: null, ...(exceptId && { _id: { $ne: exceptId } }) });
  if (pinnedCount >= MAX_PINNED_NOTICES) {
    throw new AppError(409, 'CONFLICT', `A branch can pin up to ${MAX_PINNED_NOTICES} notices. Unpin one first.`, [
      { path: 'pinned', message: 'validation.pinLimit' },
    ]);
  }
}

export async function createNotice(viewer: Viewer, input: Input): Promise<Notice> {
  const branch = await targetBranch(viewer, input.branchId);
  if (input.pinned) await assertPinRoom(branch._id);
  const doc = await NoticeModel.create({
    title: input.title,
    body: input.body,
    kind: input.kind,
    pinned: input.pinned,
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    authorUserId: new Types.ObjectId(viewer.id),
    authorName: viewer.name,
  });
  const [notice] = await toNotices(viewer, [doc.toObject()]);
  if (!notice) throw noticeGone();
  return notice;
}

async function loadEditable(viewer: Viewer, id: string) {
  if (!Types.ObjectId.isValid(id)) throw noticeGone();
  const doc = await NoticeModel.findOne({ _id: id, removedAt: null });
  if (!doc) throw noticeGone();
  if (!hasReach(viewer, 'notice:publish', doc)) throw forbidden('Only the committee of this branch can change this notice.');
  return doc;
}

export async function updateNotice(viewer: Viewer, id: string, input: Input): Promise<Notice> {
  const doc = await loadEditable(viewer, id);
  const branch = await targetBranch(viewer, input.branchId);
  if (input.pinned && (!doc.pinned || String(doc.branchId) !== String(branch._id))) await assertPinRoom(branch._id, doc._id);
  Object.assign(doc, {
    title: input.title,
    body: input.body,
    kind: input.kind,
    pinned: input.pinned,
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    editedAt: new Date(),
  });
  await doc.save();
  const [notice] = await toNotices(viewer, [doc.toObject()]);
  if (!notice) throw noticeGone();
  return notice;
}

export async function removeNotice(viewer: Viewer, id: string): Promise<void> {
  const doc = await loadEditable(viewer, id);
  doc.removedAt = new Date();
  await doc.save();
}
