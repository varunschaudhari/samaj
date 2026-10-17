import {
  type CandidateType,
  type Language,
  type Melava,
  type MelavaDetail,
  type MelavaRegistration,
  type OfficeCandidate,
  formatPhone,
  gotraName,
  isGlobalRole,
  nameKey,
  phoneSchema,
  type melavaInputSchema,
  type melavaOfficeRegisterSchema,
  type melavaRegisterSchema,
} from '@samaj/shared';
import { type HydratedDocument, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { type MelavaDoc, MelavaModel, type MelavaRegistrationDoc, MelavaRegistrationModel } from '../models/melava.model';
import { type MemberDoc, MemberModel } from '../models/member.model';
import { searchWords } from '../models/plugins';
import { type ProfileDoc, ProfileModel } from '../models/profile.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { canBrowseDirectory, canManageProfile, hasReach } from './access';
import { inBranch } from './audience';
import { ageOf, assertComplete, ineligibility, missingFor, toCards } from './matrimony.service';
import { notVerified } from './member.service';
import type { Viewer } from './viewer';

type Input = z.output<typeof melavaInputSchema>;
type RegisterInput = z.output<typeof melavaRegisterSchema>;
type OfficeRegisterInput = z.output<typeof melavaOfficeRegisterSchema>;
type MelavaDocument = HydratedDocument<MelavaDoc>;

const melavaGone = () => notFound('That melava is no longer listed.');
const registrationGone = () => notFound('That registration is no longer there.');
const issue = (message: string, path = 'melava') => [{ path, message }];

/** The organising branch's committee, and admins, run a melava. */
export const canManageMelava = (viewer: Viewer, m: Pick<MelavaDoc, 'branchId' | 'branchAncestors'>) => hasReach(viewer, 'member:write', m);

async function loadMelava(id: string): Promise<MelavaDocument> {
  if (!Types.ObjectId.isValid(id)) throw melavaGone();
  const melava = await MelavaModel.findById(id);
  if (!melava) throw melavaGone();
  return melava;
}

async function loadManaged(viewer: Viewer, id: string) {
  const melava = await loadMelava(id);
  if (!canManageMelava(viewer, melava)) throw forbidden('Only the organising committee can do this.');
  return melava;
}

async function toMelavas(viewer: Viewer, docs: MelavaDoc[]): Promise<Melava[]> {
  const ids = docs.map((d) => d._id);
  const [branches, counts] = await Promise.all([
    BranchModel.find({ _id: { $in: docs.map((d) => d.branchId) } }).lean(),
    MelavaRegistrationModel.aggregate<{ _id: { melavaId: Types.ObjectId; type: CandidateType }; n: number }>([
      { $match: { melavaId: { $in: ids }, status: 'verified' } },
      { $group: { _id: { melavaId: '$melavaId', type: '$candidateType' }, n: { $sum: 1 } } },
    ]),
  ]);
  const branchBy = new Map(branches.map((b) => [String(b._id), b]));
  const count = (id: Types.ObjectId, type: CandidateType) => counts.find((c) => String(c._id.melavaId) === String(id) && c._id.type === type)?.n ?? 0;
  return docs.map((d) => {
    const b = branchBy.get(String(d.branchId));
    return {
      id: String(d._id),
      name: d.name,
      date: d.date,
      venue: d.venue ?? null,
      branch: { id: String(d.branchId), name: b?.name ?? '', nameMr: b?.nameMr ?? '' },
      fee: d.fee,
      paymentInstructions: d.paymentInstructions ?? null,
      registrationOpen: d.registrationOpen,
      counts: { bride: count(d._id, 'bride'), groom: count(d._id, 'groom') },
      permissions: { canManage: canManageMelava(viewer, d) },
    };
  });
}

async function toRegistrations(docs: MelavaRegistrationDoc[]): Promise<MelavaRegistration[]> {
  const profiles = await ProfileModel.find({ _id: { $in: docs.map((d) => d.profileId) } }).lean();
  const cards = new Map((await toCards(profiles)).map((c) => [c.id, c]));
  return docs.flatMap((d) => {
    const profile = cards.get(String(d.profileId));
    if (!profile) return [];
    return [
      {
        id: String(d._id),
        melavaId: String(d.melavaId),
        status: d.status,
        candidateType: d.candidateType,
        candidateNumber: d.candidateNumber ?? null,
        paymentRef: d.paymentRef,
        cancelReason: d.cancelReason ?? null,
        profile,
        createdAt: (d.createdAt ?? new Date()).toISOString(),
        verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
      },
    ];
  });
}

/** Melavas from a month ago onwards, soonest first. Any verified family may see and join them. */
export async function listMelavas(viewer: Viewer): Promise<Melava[]> {
  if (!canBrowseDirectory(viewer)) throw notVerified();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const docs = await MelavaModel.find({ date: { $gte: since } }).sort({ date: 1 }).limit(50).lean();
  return toMelavas(viewer, docs);
}

/** Registrations in the office's order: brides, then grooms, by number; then the ones still waiting. */
function officeOrder(a: MelavaRegistrationDoc, b: MelavaRegistrationDoc) {
  const rank = (r: MelavaRegistrationDoc) => (r.status === 'verified' ? 0 : r.status === 'pendingPayment' ? 1 : 2);
  return rank(a) - rank(b) || a.candidateType.localeCompare(b.candidateType) || (a.candidateNumber ?? 0) - (b.candidateNumber ?? 0) || +(a.createdAt ?? 0) - +(b.createdAt ?? 0);
}

export async function getMelava(viewer: Viewer, id: string): Promise<MelavaDetail> {
  if (!canBrowseDirectory(viewer)) throw notVerified();
  const melava = await loadMelava(id);
  const [base] = await toMelavas(viewer, [melava.toObject()]);
  if (!base) throw melavaGone();
  const mine = await MelavaRegistrationModel.find({ melavaId: melava._id, familyId: new Types.ObjectId(viewer.familyId) }).lean();
  const detail: MelavaDetail = { ...base, mine: await toRegistrations(mine) };
  if (base.permissions.canManage) {
    const all = await MelavaRegistrationModel.find({ melavaId: melava._id }).lean();
    detail.registrations = await toRegistrations(all.sort(officeOrder));
  }
  return detail;
}

async function branchPlacement(branchId: string) {
  const branch = await BranchModel.findById(branchId).lean();
  if (!branch) throw new AppError(400, 'VALIDATION_FAILED', 'Pick the organising branch.', issue('validation.branchRequired', 'branchId'));
  return { branchId: branch._id, branchAncestors: branch.ancestors };
}

export async function createMelava(viewer: Viewer, input: Input): Promise<MelavaDetail> {
  const placement = await branchPlacement(input.branchId);
  if (!canManageMelava(viewer, placement)) throw forbidden('Only that branch’s committee or an admin can organise a melava there.');
  const melava = await MelavaModel.create({ ...input, ...placement, createdByUserId: new Types.ObjectId(viewer.id) });
  return getMelava(viewer, String(melava._id));
}

export async function updateMelava(viewer: Viewer, id: string, input: Input): Promise<MelavaDetail> {
  const melava = await loadManaged(viewer, id);
  const placement = await branchPlacement(input.branchId);
  if (!canManageMelava(viewer, placement)) throw forbidden('Only that branch’s committee or an admin can organise a melava there.');
  melava.set({ ...input, ...placement });
  await melava.save();
  return getMelava(viewer, id);
}

/**
 * A family registers one of its profiles. The profile must be complete and
 * sent to the committee (waiting or live); the office checks the payment
 * reference before giving a number.
 */
export async function register(viewer: Viewer, melavaId: string, input: RegisterInput): Promise<MelavaDetail> {
  if (!canBrowseDirectory(viewer)) throw notVerified();
  const melava = await loadMelava(melavaId);
  const today = new Date().toISOString().slice(0, 10);
  if (!melava.registrationOpen || melava.date < today) throw new AppError(409, 'CONFLICT', 'Registration for this melava has closed.', issue('validation.melavaClosed'));

  const profile = Types.ObjectId.isValid(input.profileId) ? await ProfileModel.findById(input.profileId) : null;
  if (!profile || String(profile.familyId) !== viewer.familyId) throw forbidden('Register one of your own family’s profiles.');
  if (profile.status !== 'pending' && profile.status !== 'active') {
    throw new AppError(409, 'CONFLICT', 'Send the profile for approval first. Paused and closed profiles can’t be registered.', issue('validation.melavaProfile', 'profileId'));
  }
  assertComplete(profile);

  await openRegistration(viewer, melava, profile, input.paymentRef);
  return getMelava(viewer, melavaId);
}

/** A new registration waiting for payment, or a cancelled one reopened. Refuses a second live one. */
async function openRegistration(viewer: Viewer, melava: MelavaDocument, profile: ProfileDoc, paymentRef: string) {
  const existing = await MelavaRegistrationModel.findOne({ melavaId: melava._id, profileId: profile._id });
  if (existing && existing.status !== 'cancelled') throw new AppError(409, 'CONFLICT', 'This profile is already registered.', issue('validation.melavaRegistered', 'profileId'));

  const fields = {
    status: 'pendingPayment' as const,
    paymentRef,
    cancelReason: null,
    candidateNumber: null,
    verifiedAt: null,
    verifiedByUserId: null,
    registeredByUserId: new Types.ObjectId(viewer.id),
  };
  if (existing) {
    existing.set(fields);
    await existing.save();
    return existing._id;
  }
  const created = await MelavaRegistrationModel.create({
    ...fields,
    melavaId: melava._id,
    profileId: profile._id,
    familyId: profile.familyId,
    candidateType: profile.gender === 'female' ? 'bride' : 'groom',
  });
  return created._id;
}

/* ---------- At the office counter ---------- */

/**
 * People the office can help: in the organiser's branch (anywhere, for an
 * admin), found by name or mobile. Each comes with what can be done next:
 * create a profile, complete it, or register it.
 */
export async function officeSearch(viewer: Viewer, melavaId: string, q: string): Promise<OfficeCandidate[]> {
  const melava = await loadManaged(viewer, melavaId);
  const conditions: Record<string, unknown>[] = [{ deceased: { $ne: true } }];
  if (!isGlobalRole(viewer.role)) conditions.push(inBranch(viewer.branchId));

  const phone = phoneSchema.safeParse(q);
  if (phone.success) {
    // A mobile number: the person's own, or the one on a profile of theirs.
    const byProfile = await ProfileModel.find({ $or: [{ contactPhone: phone.data }, { candidateMobile: phone.data }, { parentWhatsapp: phone.data }] }, { memberId: 1 }).lean();
    conditions.push({ $or: [{ phone: phone.data }, { _id: { $in: byProfile.map((p) => p.memberId) } }] });
  } else {
    for (const word of searchWords(q)) {
      const key = nameKey(word);
      conditions.push({ $or: [{ nameTokens: word }, ...(key ? [{ keyTokens: key }] : [])] });
    }
  }

  const members = await MemberModel.find({ $and: conditions }).sort({ name: 1 }).limit(40).lean();
  const familyIds = [...new Set(members.map((m) => String(m.familyId)))].map((id) => new Types.ObjectId(id));
  const [profiles, relatives] = await Promise.all([
    ProfileModel.find({ memberId: { $in: members.map((m) => m._id) } }),
    MemberModel.find({ familyId: { $in: familyIds }, $or: [{ isHead: true }, { relation: 'spouse' }] }, { familyId: 1, isHead: 1, relation: 1, name: 1, phone: 1 }).lean(),
  ]);
  const registrations = await MelavaRegistrationModel.find({ melavaId: melava._id, profileId: { $in: profiles.map((p) => p._id) } }).lean();
  const profileBy = new Map(profiles.map((p) => [String(p.memberId), p]));
  const registrationBy = new Map(registrations.map((r) => [String(r.profileId), r]));
  const headOf = (familyId: Types.ObjectId) => relatives.find((r) => r.isHead && String(r.familyId) === String(familyId));
  const hasSpouse = (familyId: Types.ObjectId) => relatives.some((r) => r.relation === 'spouse' && String(r.familyId) === String(familyId));

  return members.flatMap((m: MemberDoc) => {
    const profile = profileBy.get(String(m._id));
    const canCreateProfile = !profile && ineligibility(m, hasSpouse(m.familyId)) === null;
    // Only people the office can act on: those with a profile, or who could have one.
    if (!profile && !canCreateProfile) return [];
    const head = headOf(m.familyId);
    const registration = profile ? registrationBy.get(String(profile._id)) : undefined;
    return [
      {
        memberId: String(m._id),
        name: m.name,
        gender: m.gender,
        age: ageOf(m.birthYear),
        familyId: String(m.familyId),
        familyHead: head?.name ?? '',
        place: m.place,
        canCreateProfile,
        suggestedContact: { name: head?.name ?? m.name, phone: head?.phone ?? m.phone ?? null },
        profile: profile ? { id: String(profile._id), status: profile.status, missing: missingFor(profile) } : null,
        registration: registration ? { id: String(registration._id), status: registration.status, candidateNumber: registration.candidateNumber ?? null } : null,
      },
    ];
  });
}

/**
 * The office registers a profile it filled in at the counter. A complete
 * draft is sent to the committee on the way; when the fee was paid there and
 * then, the number is given at once.
 */
export async function officeRegister(viewer: Viewer, melavaId: string, input: OfficeRegisterInput): Promise<MelavaDetail> {
  const melava = await loadManaged(viewer, melavaId);
  const today = new Date().toISOString().slice(0, 10);
  // The office may still register after online registration closes, until the day itself.
  if (melava.date < today) throw new AppError(409, 'CONFLICT', 'This melava is over.', issue('validation.melavaClosed'));

  const profile = Types.ObjectId.isValid(input.profileId) ? await ProfileModel.findById(input.profileId) : null;
  if (!profile || !canManageProfile(viewer, profile)) throw forbidden('The office can register profiles from its own branch only.');
  if (!['draft', 'pending', 'active'].includes(profile.status)) {
    throw new AppError(409, 'CONFLICT', 'Paused and closed profiles can’t be registered.', issue('validation.melavaProfile', 'profileId'));
  }
  assertComplete(profile);
  if (profile.status === 'draft') {
    profile.status = 'pending';
    profile.submittedAt = new Date();
    await profile.save();
  }

  const reference = input.paymentRef ?? (input.paid ? 'Paid at office' : 'To pay at office');
  const registrationId = await openRegistration(viewer, melava, profile, reference);
  if (input.paid) await assignNumber(viewer, melava, registrationId);
  return getMelava(viewer, melavaId);
}

async function loadRegistration(melava: MelavaDocument, registrationId: string) {
  if (!Types.ObjectId.isValid(registrationId)) throw registrationGone();
  const registration = await MelavaRegistrationModel.findOne({ _id: registrationId, melavaId: melava._id });
  if (!registration) throw registrationGone();
  return registration;
}

const alreadyHandled = () => new AppError(409, 'CONFLICT', 'This registration was already handled. Reload to see the latest.', issue('validation.profileChanged'));

/** Mark a registration paid and give it the next number in its sequence. */
async function assignNumber(viewer: Viewer, melava: MelavaDocument, registrationId: Types.ObjectId) {
  // Claim the registration first, so two clicks can't take two numbers.
  const claimed = await MelavaRegistrationModel.findOneAndUpdate(
    { _id: registrationId, status: 'pendingPayment' },
    { $set: { status: 'verified', verifiedByUserId: new Types.ObjectId(viewer.id), verifiedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!claimed) throw alreadyHandled();
  const counter = `counters.${claimed.candidateType}`;
  const updated = await MelavaModel.findByIdAndUpdate(melava._id, { $inc: { [counter]: 1 } }, { returnDocument: 'after' }).lean();
  const number = updated?.counters?.[claimed.candidateType] ?? null;
  await MelavaRegistrationModel.updateOne({ _id: claimed._id }, { $set: { candidateNumber: number } });
}

/** The office has seen the payment: the candidate gets the next number in their sequence. */
export async function verifyPayment(viewer: Viewer, melavaId: string, registrationId: string): Promise<MelavaDetail> {
  const melava = await loadManaged(viewer, melavaId);
  const registration = await loadRegistration(melava, registrationId);
  if (registration.status !== 'pendingPayment') throw alreadyHandled();
  await assignNumber(viewer, melava, registration._id);
  return getMelava(viewer, melavaId);
}

/** The office, or the family itself, cancels. A number already given is retired, not reused. */
export async function cancelRegistration(viewer: Viewer, melavaId: string, registrationId: string, reason: string): Promise<MelavaDetail> {
  const melava = await loadMelava(melavaId);
  const registration = await loadRegistration(melava, registrationId);
  const own = String(registration.familyId) === viewer.familyId;
  if (!canManageMelava(viewer, melava) && !(own && registration.status === 'pendingPayment')) throw forbidden('Only the organising committee can cancel this.');
  if (registration.status === 'cancelled') return getMelava(viewer, melavaId);
  registration.status = 'cancelled';
  registration.cancelReason = reason;
  await registration.save();
  return getMelava(viewer, melavaId);
}

/* ---------- The list for the printed booklet ---------- */

const LABELS: Record<Language, Record<string, string>> = {
  en: {
    bride: 'Bride', groom: 'Groom',
    neverMarried: 'Unmarried', divorced: 'Divorced', widowed: 'Widowed',
    yes: 'Yes', no: 'No', dontKnow: 'Not known',
    pahate: 'Pre-dawn', sakal: 'Morning', dupar: 'Afternoon', sandhya: 'Evening', ratra: 'Night',
    master: "Master's", bachelor: "Bachelor's", diploma: 'Diploma', other: 'Other',
    private: 'Private', government: 'Government', selfEmployed: 'Self-employed',
  },
  mr: {
    bride: 'वधू', groom: 'वर',
    neverMarried: 'अविवाहित', divorced: 'घटस्फोटीत', widowed: 'विधवा/विधुर',
    yes: 'होय', no: 'नाही', dontKnow: 'माहीत नाही',
    pahate: 'पहाटे', sakal: 'सकाळ', dupar: 'दुपार', sandhya: 'संध्याकाळ', ratra: 'रात्र',
    master: 'पदव्युत्तर', bachelor: 'पदवी', diploma: 'पदविका', other: 'इतर',
    private: 'खाजगी', government: 'सरकारी', selfEmployed: 'स्वयंरोजगार',
  },
};

const COLUMNS: { en: string; mr: string; value: (p: ProfileDoc & { name: string }, r: MelavaRegistrationDoc, l: Language) => string | number | null | undefined }[] = [
  { en: 'Number', mr: 'क्रमांक', value: (_p, r) => r.candidateNumber },
  { en: 'Bride/Groom', mr: 'वधू/वर', value: (_p, r, l) => LABELS[l][r.candidateType] },
  { en: 'Surname', mr: 'आडनाव', value: (p) => p.surname },
  { en: 'Name', mr: 'नाव', value: (p) => p.firstName ?? p.name },
  { en: "Father's name", mr: 'वडिलांचे नाव', value: (p) => p.fatherName },
  { en: 'Kul', mr: 'कुल', value: (p, _r, l) => gotraName(p.gotra, l) },
  { en: 'Height (cm)', mr: 'उंची (सेमी)', value: (p) => p.heightCm },
  { en: 'Date of birth', mr: 'जन्म तारीख', value: (p) => p.birthDate },
  { en: 'Age', mr: 'वय', value: (p) => ageOf(p.birthYear) },
  { en: 'Time of birth', mr: 'वेळ', value: (p, _r, l) => [p.birthTimeOfDay ? LABELS[l][p.birthTimeOfDay] : null, p.birthTime].filter(Boolean).join(' ') },
  { en: 'Place of birth', mr: 'जन्म ठिकाण', value: (p) => p.birthPlace },
  { en: 'Main education', mr: 'मुख्य शिक्षण', value: (p, _r, l) => (p.educationLevel ? LABELS[l][p.educationLevel] : null) },
  { en: 'Degree', mr: 'शिक्षण', value: (p) => p.education },
  { en: 'Other education', mr: 'इतर शिक्षण', value: (p) => p.otherEducation },
  { en: 'Job/business', mr: 'नोकरी/व्यवसाय', value: (p) => p.occupation },
  { en: 'Employer type', mr: 'नोकरीचा प्रकार', value: (p, _r, l) => (p.employerType ? LABELS[l][p.employerType] : null) },
  { en: 'Employer', mr: 'कंपनी/संस्था', value: (p) => [p.employerName, p.employerAddress].filter(Boolean).join(', ') },
  { en: 'Designation', mr: 'हुद्दा', value: (p) => p.designation },
  { en: 'Monthly income (₹)', mr: 'मासिक उत्पन्न (₹)', value: (p) => p.monthlyIncome },
  { en: "Parent's name", mr: 'पालकाचे पूर्ण नाव', value: (p) => p.parentName },
  { en: "Parent's occupation", mr: 'पालकाचा व्यवसाय/नोकरी', value: (p) => p.parentOccupation },
  { en: "Parent's village", mr: 'पालकाचे गाव', value: (p) => p.parentWorkVillage },
  { en: 'Native village', mr: 'मुळगाव', value: (p) => [p.nativeVillage, p.nativeDistrict].filter(Boolean).join(', ') },
  { en: "Mama's name", mr: 'मामाचे पूर्ण नाव', value: (p) => p.mamaName },
  { en: "Mama's kul", mr: 'मामाचे कुल', value: (p, _r, l) => gotraName(p.mamaKul, l) },
  { en: "Mama's village", mr: 'मामाचे गाव', value: (p) => p.mamaVillage },
  { en: "Mama's native village", mr: 'मामाचे मुळगाव', value: (p) => [p.mamaNativeVillage, p.mamaNativeDistrict].filter(Boolean).join(', ') },
  { en: "Mama's mobile", mr: 'मामाचा मोबाईल', value: (p) => (p.mamaMobile ? formatPhone(p.mamaMobile) : null) },
  { en: 'Address', mr: 'राहण्याचा पत्ता', value: (p) => p.addressLine },
  { en: 'Village', mr: 'गाव', value: (p) => p.village },
  { en: 'Taluka', mr: 'तालुका', value: (p) => p.taluka },
  { en: 'District', mr: 'जिल्हा', value: (p) => p.district },
  { en: 'Pincode', mr: 'पिनकोड', value: (p) => p.pincode },
  { en: 'Mobile', mr: 'मोबाईल नं.', value: (p) => formatPhone(p.contactPhone) },
  { en: "Candidate's mobile", mr: 'वधू/वर मोबाईल नं.', value: (p) => (p.candidateMobile ? formatPhone(p.candidateMobile) : null) },
  { en: "Parent's WhatsApp", mr: 'पालकाचा व्हॉट्सअप नंबर', value: (p) => (p.parentWhatsapp ? formatPhone(p.parentWhatsapp) : null) },
  { en: 'Manglik', mr: 'मंगळ', value: (p, _r, l) => (p.manglik ? LABELS[l][p.manglik] : null) },
  { en: 'Marital status', mr: 'वैवाहिक स्थिती', value: (p, _r, l) => (p.maritalStatus ? LABELS[l][p.maritalStatus] : null) },
  { en: 'Disability', mr: 'व्यंग', value: (p, _r, l) => (p.hasDisability ? p.disabilityDetail || LABELS[l].yes : LABELS[l].no) },
  { en: 'Payment reference', mr: 'पेमेंट संदर्भ', value: (_p, r) => r.paymentRef },
];

/** One CSV cell: quoted when it holds a comma, quote or line break; formulas neutralised for spreadsheets. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Verified candidates with every form field, for the booklet: brides then grooms, by number. */
export async function exportCsv(viewer: Viewer, melavaId: string, language: Language): Promise<{ filename: string; csv: string }> {
  const melava = await loadManaged(viewer, melavaId);
  const registrations = (await MelavaRegistrationModel.find({ melavaId: melava._id, status: 'verified' }).lean()).sort(officeOrder);
  const profiles = await ProfileModel.find({ _id: { $in: registrations.map((r) => r.profileId) } }).lean();
  const members = await MemberModel.find({ _id: { $in: profiles.map((p) => p.memberId) } }, { name: 1 }).lean();
  const nameBy = new Map(members.map((m) => [String(m._id), m.name]));
  const profileBy = new Map(profiles.map((p) => [String(p._id), { ...p, name: nameBy.get(String(p.memberId)) ?? '' }]));

  const lines = [COLUMNS.map((c) => cell(c[language])).join(',')];
  for (const r of registrations) {
    const p = profileBy.get(String(r.profileId));
    if (p) lines.push(COLUMNS.map((c) => cell(c.value(p, r, language))).join(','));
  }
  const slug = melava.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'melava';
  // A byte-order mark so Excel opens the Marathi text as UTF-8.
  return { filename: `${slug}-${melava.date}.csv`, csv: `﻿${lines.join('\r\n')}\r\n` };
}
