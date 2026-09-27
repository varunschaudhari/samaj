import { type FieldIssue, type InterestItem, MAX_PENDING_SENT } from '@samaj/shared';
import { Types } from 'mongoose';
import { InterestModel } from '../models/interest.model';
import { ProfileModel } from '../models/profile.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { canBrowseDirectory, canViewProfile } from './access';
import { toCards } from './matrimony.service';
import { notVerified } from './member.service';
import type { Viewer } from './viewer';
import { gotrasOf } from './matrimony.service';

const refuse = (status: number, message: string, key: string) =>
  new AppError(status, status === 409 ? 'CONFLICT' : 'FORBIDDEN', message, [{ path: 'interest', message: key }] satisfies FieldIssue[]);

/** Send interest from one of the viewer's live profiles to another family's live profile. */
export async function sendInterest(viewer: Viewer, fromProfileId: string, toProfileId: string): Promise<InterestItem> {
  if (!canBrowseDirectory(viewer)) throw notVerified();
  const [from, to] = await Promise.all([ProfileModel.findById(fromProfileId), ProfileModel.findById(toProfileId)]);
  if (!from || String(from.familyId) !== viewer.familyId) throw forbidden('Send interest from one of your own family’s profiles.');
  if (!to || !canViewProfile(viewer, to)) throw notFound('That profile is no longer available.');
  if (from.status !== 'active' || to.status !== 'active') throw refuse(409, 'Both profiles need to be live.', 'validation.interestNotActive');
  if (String(from.familyId) === String(to.familyId)) throw refuse(403, 'Both profiles are in the same family.', 'validation.interestSameFamily');
  if (from.gender === to.gender) throw refuse(403, 'Interest is only for the opposite gender.', 'validation.interestGender');
  // Same rule as search: the API refuses same-gotra matches even if someone crafts the request.
  if (gotrasOf(from).some((g) => gotrasOf(to).includes(g))) throw refuse(403, 'Both families have the same gotra.', 'validation.interestSameGotra');

  const reverse = await InterestModel.findOne({ fromProfileId: to._id, toProfileId: from._id, status: { $in: ['pending', 'accepted'] } }).lean();
  if (reverse) throw refuse(409, 'They already sent you interest. Answer it in Interests.', 'validation.interestReverse');

  const existing = await InterestModel.findOne({ fromProfileId: from._id, toProfileId: to._id });
  if (existing && existing.status !== 'withdrawn') throw refuse(409, 'You already sent interest to this profile.', 'validation.interestExists');

  const pending = await InterestModel.countDocuments({ fromProfileId: from._id, status: 'pending' });
  if (pending >= MAX_PENDING_SENT) throw refuse(409, `A profile can have ${MAX_PENDING_SENT} interests waiting at a time.`, 'validation.interestLimit');

  const fields = { status: 'pending' as const, sentByUserId: new Types.ObjectId(viewer.id), respondedAt: null };
  const interest = existing
    ? Object.assign(existing, fields)
    : new InterestModel({ ...fields, fromProfileId: from._id, toProfileId: to._id, fromFamilyId: from.familyId, toFamilyId: to.familyId });
  await interest.save();

  const items = await listInterests(viewer);
  const item = items.find((i) => i.id === String(interest._id));
  if (!item) throw notFound('That profile is no longer available.');
  return item;
}

/** Everything sent and received by the viewer's family, newest first. */
export async function listInterests(viewer: Viewer): Promise<InterestItem[]> {
  const familyId = new Types.ObjectId(viewer.familyId);
  const interests = await InterestModel.find({ $or: [{ fromFamilyId: familyId }, { toFamilyId: familyId }] }).sort({ updatedAt: -1 }).limit(200).lean();
  const profileIds = interests.flatMap((i) => [i.fromProfileId, i.toProfileId]);
  const profiles = await ProfileModel.find({ _id: { $in: profileIds } }).lean();
  const cards = new Map((await toCards(profiles)).map((c) => [c.id, c]));
  const docs = new Map(profiles.map((p) => [String(p._id), p]));

  return interests.flatMap((i) => {
    const sentByViewer = String(i.fromFamilyId) === viewer.familyId;
    const ownId = String(sentByViewer ? i.fromProfileId : i.toProfileId);
    const otherId = String(sentByViewer ? i.toProfileId : i.fromProfileId);
    const own = cards.get(ownId);
    const other = cards.get(otherId);
    const otherDoc = docs.get(otherId);
    if (!own || !other || !otherDoc) return [];
    return [
      {
        id: String(i._id),
        status: i.status,
        sentByViewer,
        fromProfileId: String(i.fromProfileId),
        toProfileId: String(i.toProfileId),
        other,
        own: { id: own.id, name: own.name },
        createdAt: (i.createdAt ?? new Date()).toISOString(),
        ...(i.status === 'accepted' && { contact: { name: otherDoc.contactName, phone: otherDoc.contactPhone } }),
      },
    ];
  });
}

async function loadInterest(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('That interest no longer exists.');
  const interest = await InterestModel.findById(id);
  if (!interest) throw notFound('That interest no longer exists.');
  return interest;
}

/** The receiving family accepts or declines. Accepting shares both families' contact details. */
export async function respond(viewer: Viewer, id: string, accept: boolean): Promise<InterestItem[]> {
  const interest = await loadInterest(id);
  if (String(interest.toFamilyId) !== viewer.familyId) throw forbidden('Only the family who received this interest can answer it.');
  if (interest.status !== 'pending') throw refuse(409, 'This interest was already answered.', 'validation.interestAnswered');
  interest.status = accept ? 'accepted' : 'declined';
  interest.respondedAt = new Date();
  await interest.save();
  return listInterests(viewer);
}

export async function withdraw(viewer: Viewer, id: string): Promise<InterestItem[]> {
  const interest = await loadInterest(id);
  if (String(interest.fromFamilyId) !== viewer.familyId) throw forbidden('Only the family who sent this interest can withdraw it.');
  if (interest.status !== 'pending') throw refuse(409, 'This interest was already answered.', 'validation.interestAnswered');
  interest.status = 'withdrawn';
  interest.respondedAt = new Date();
  await interest.save();
  return listInterests(viewer);
}
