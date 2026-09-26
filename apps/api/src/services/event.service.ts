import type { EventDetail, EventSummary, eventInputSchema, eventListQuerySchema } from '@samaj/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { type EventDoc, EventModel } from '../models/event.model';
import { FamilyModel } from '../models/family.model';
import { MemberModel } from '../models/member.model';
import { RsvpModel } from '../models/rsvp.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { hasReach } from './access';
import { branchAudience } from './audience';
import type { Viewer } from './viewer';

type Input = z.output<typeof eventInputSchema>;
type ListQuery = z.output<typeof eventListQuerySchema>;

const eventGone = () => notFound('That event is no longer available.');

/** An event counts as upcoming until it has ended (or, with no end time, 12 hours after it starts). */
const HALF_DAY = 12 * 60 * 60 * 1000;
const hasEnded = (e: Pick<EventDoc, 'startsAt' | 'endsAt'>) => (e.endsAt ?? new Date(e.startsAt.getTime() + HALF_DAY)).getTime() < Date.now();

async function summaries(viewer: Viewer, docs: EventDoc[]): Promise<EventSummary[]> {
  const ids = docs.map((d) => d._id);
  const [branches, totals, mine] = await Promise.all([
    BranchModel.find({ _id: { $in: docs.map((d) => d.branchId) } }).lean(),
    RsvpModel.aggregate<{ _id: Types.ObjectId; people: number; families: number }>([
      { $match: { eventId: { $in: ids } } },
      { $group: { _id: '$eventId', people: { $sum: '$people' }, families: { $sum: 1 } } },
    ]),
    RsvpModel.find({ eventId: { $in: ids }, familyId: new Types.ObjectId(viewer.familyId) }).lean(),
  ]);
  const branchBy = new Map(branches.map((b) => [String(b._id), b]));
  const totalBy = new Map(totals.map((t) => [String(t._id), t]));
  const mineBy = new Map(mine.map((r) => [String(r.eventId), r.people]));
  return docs.map((d) => {
    const b = branchBy.get(String(d.branchId));
    const total = totalBy.get(String(d._id));
    return {
      id: String(d._id),
      title: d.title,
      startsAt: d.startsAt.toISOString(),
      endsAt: d.endsAt ? d.endsAt.toISOString() : null,
      venue: d.venue,
      branch: { id: String(d.branchId), name: b?.name ?? '', nameMr: b?.nameMr ?? '' },
      rsvpEnabled: d.rsvpEnabled,
      headcount: total?.people ?? 0,
      families: total?.families ?? 0,
      myPeople: mineBy.get(String(d._id)) ?? 0,
    };
  });
}

const DAY = 24 * 60 * 60 * 1000;
/** Events longer than this are rare; it bounds the query before the exact "has it ended" check. */
const LONGEST_EVENT = 7 * DAY;

/** Upcoming: not yet ended, soonest first. Past: ended in the last year, most recent first. */
export async function listEvents(viewer: Viewer, query: ListQuery): Promise<EventSummary[]> {
  const audience = await branchAudience(viewer);
  const now = Date.now();
  const window =
    query.when === 'upcoming'
      ? { startsAt: { $gte: new Date(now - LONGEST_EVENT) } }
      : { startsAt: { $lt: new Date(now), $gte: new Date(now - 365 * DAY) } };
  const docs = await EventModel.find({ $and: [{ removedAt: null }, audience, window] })
    .sort({ startsAt: query.when === 'upcoming' ? 1 : -1 })
    .limit(100)
    .lean();
  const picked = docs.filter((d) => (query.when === 'upcoming' ? !hasEnded(d) : hasEnded(d)));
  return summaries(viewer, picked);
}

async function loadVisible(viewer: Viewer, id: string) {
  if (!Types.ObjectId.isValid(id)) throw eventGone();
  const doc = await EventModel.findOne({ $and: [{ _id: new Types.ObjectId(id), removedAt: null }, await branchAudience(viewer)] });
  if (!doc) throw eventGone();
  return doc;
}

export async function getEvent(viewer: Viewer, id: string): Promise<EventDetail> {
  const doc = await loadVisible(viewer, id);
  const [summary] = await summaries(viewer, [doc.toObject()]);
  if (!summary) throw eventGone();
  const canEdit = hasReach(viewer, 'notice:publish', doc);
  const detail: EventDetail = {
    ...summary,
    description: doc.description ?? null,
    mapUrl: doc.mapUrl ?? null,
    createdByName: doc.createdByName,
    permissions: { canEdit },
  };

  if (canEdit) {
    // The organisers see who is coming, by family.
    const rsvps = await RsvpModel.find({ eventId: doc._id }).sort({ updatedAt: -1 }).lean();
    const familyIds = rsvps.map((r) => r.familyId);
    const [heads, families] = await Promise.all([
      MemberModel.find({ familyId: { $in: familyIds }, isHead: true }, { familyId: 1, name: 1 }).lean(),
      FamilyModel.find({ _id: { $in: familyIds } }, { place: 1 }).lean(),
    ]);
    const headBy = new Map(heads.map((h) => [String(h.familyId), h.name]));
    const placeBy = new Map(families.map((f) => [String(f._id), f.place]));
    detail.attendees = rsvps.map((r) => ({
      familyId: String(r.familyId),
      headName: headBy.get(String(r.familyId)) ?? '',
      place: placeBy.get(String(r.familyId)) ?? '',
      people: r.people,
    }));
  }
  return detail;
}

async function targetBranch(viewer: Viewer, branchId: string) {
  const branch = await BranchModel.findById(branchId).lean();
  if (!branch) throw new AppError(400, 'VALIDATION_FAILED', 'Pick a branch from the list.', [{ path: 'branchId', message: 'validation.branchRequired' }]);
  if (!hasReach(viewer, 'notice:publish', { branchId: branch._id, branchAncestors: branch.ancestors })) {
    throw new AppError(403, 'FORBIDDEN', 'You can add events only for your own branch and the towns under it.', [
      { path: 'branchId', message: 'validation.noticeBranch' },
    ]);
  }
  return branch;
}

function fields(input: Input) {
  return {
    title: input.title,
    description: input.description,
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    venue: input.venue,
    mapUrl: input.mapUrl,
    rsvpEnabled: input.rsvpEnabled,
  };
}

export async function createEvent(viewer: Viewer, input: Input): Promise<EventDetail> {
  const branch = await targetBranch(viewer, input.branchId);
  const doc = await EventModel.create({
    ...fields(input),
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    createdByUserId: new Types.ObjectId(viewer.id),
    createdByName: viewer.name,
  });
  return getEvent(viewer, String(doc._id));
}

async function loadEditable(viewer: Viewer, id: string) {
  const doc = await loadVisible(viewer, id);
  if (!hasReach(viewer, 'notice:publish', doc)) throw forbidden('Only the committee of this branch can change this event.');
  return doc;
}

export async function updateEvent(viewer: Viewer, id: string, input: Input): Promise<EventDetail> {
  const doc = await loadEditable(viewer, id);
  const branch = await targetBranch(viewer, input.branchId);
  Object.assign(doc, fields(input), { branchId: branch._id, branchAncestors: branch.ancestors });
  await doc.save();
  return getEvent(viewer, id);
}

export async function removeEvent(viewer: Viewer, id: string): Promise<void> {
  const doc = await loadEditable(viewer, id);
  doc.removedAt = new Date();
  await doc.save();
}

/** A family says how many of them are coming; 0 clears it. Closed once the event has ended. */
export async function setRsvp(viewer: Viewer, id: string, people: number): Promise<EventDetail> {
  const doc = await loadVisible(viewer, id);
  if (!doc.rsvpEnabled || hasEnded(doc)) {
    throw new AppError(409, 'CONFLICT', 'RSVP is closed for this event.', [{ path: 'people', message: 'validation.rsvpClosed' }]);
  }
  const key = { eventId: doc._id, familyId: new Types.ObjectId(viewer.familyId) };
  if (people === 0) await RsvpModel.deleteOne(key);
  else await RsvpModel.updateOne(key, { $set: { people, byUserId: new Types.ObjectId(viewer.id) } }, { upsert: true });
  return getEvent(viewer, id);
}
