import { CLOSE_REASONS, DIETS, GENDERS, GOTRA_IDS, INCOME_RANGES, MANGLIK, MARITAL_STATUSES, NAKSHATRA_IDS, PROFILE_STATUSES, RASHI_IDS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';
import { branchPathPlugin } from './plugins';

const siblingsSchema = new Schema(
  {
    brothers: { type: Number, default: null },
    brothersMarried: { type: Number, default: null },
    sisters: { type: Number, default: null },
    sistersMarried: { type: Number, default: null },
  },
  { _id: false },
);

/** What the family looks for. Empty lists mean "any". */
const preferencesSchema = new Schema(
  {
    ageMin: { type: Number, default: null },
    ageMax: { type: Number, default: null },
    heightMinCm: { type: Number, default: null },
    maritalStatuses: { type: [{ type: String, enum: MARITAL_STATUSES }], default: [] },
    diets: { type: [{ type: String, enum: DIETS }], default: [] },
    branchIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: false },
);

/** A profile photo. The _id names it in URLs; the key is where the file is stored. */
const photoSchema = new Schema({ key: { type: String, required: true } });

/**
 * A matrimonial profile for one family member. gender, birthYear, gotra and
 * the branch fields are copied from the member and family so search can
 * filter without joins; the family service keeps them in sync.
 */
const profileSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, unique: true },
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true, index: true },

    heightCm: { type: Number, default: null },
    maritalStatus: { type: String, enum: MARITAL_STATUSES, default: null },
    diet: { type: String, enum: DIETS, default: null },
    /** YYYY-MM-DD; its year always matches the member's birth year. */
    birthDate: { type: String, default: null },
    birthTime: { type: String, default: null },
    birthPlace: { type: String, default: null },
    rashi: { type: String, enum: RASHI_IDS, default: null },
    nakshatra: { type: String, enum: NAKSHATRA_IDS, default: null },
    manglik: { type: String, enum: MANGLIK, default: null },
    maternalGotra: { type: String, enum: GOTRA_IDS, default: null },
    education: { type: String, default: null },
    occupation: { type: String, default: null },
    workLocation: { type: String, default: null },
    income: { type: String, enum: INCOME_RANGES, default: null },
    fatherOccupation: { type: String, default: null },
    motherOccupation: { type: String, default: null },
    nativePlace: { type: String, default: null },
    siblings: { type: siblingsSchema, default: () => ({}) },
    about: { type: String, default: null },
    expectations: { type: String, default: null },
    preferences: { type: preferencesSchema, default: () => ({}) },
    /** Up to MAX_PROFILE_PHOTOS, in order; the first is the main one. */
    photos: { type: [photoSchema], default: [] },
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true },

    status: { type: String, enum: PROFILE_STATUSES, default: 'pending', required: true },
    closeReason: { type: String, enum: CLOSE_REASONS, default: null },
    /** The committee's note when rejecting or removing a profile. */
    moderationNote: { type: String, default: null },
    submittedAt: { type: Date, default: () => new Date() },
    /** When it last went live; search shows the newest first. */
    activatedAt: { type: Date, default: null },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    /** Who confirmed the person agreed to this profile, and when. */
    consentByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    consentAt: { type: Date, required: true },

    // Copied for search.
    gender: { type: String, enum: GENDERS, required: true },
    birthYear: { type: Number, required: true },
    gotra: { type: String, enum: GOTRA_IDS, default: null },
    /** For someone adopted: the family they were born into, and its gotra, which matches are kept from too. */
    birthFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', default: null },
    birthGotra: { type: String, enum: GOTRA_IDS, default: null },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    branchAncestors: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

profileSchema.plugin(branchPathPlugin);

// Search: newest first, anywhere or within a branch.
profileSchema.index({ status: 1, gender: 1, activatedAt: -1, _id: -1 });
profileSchema.index({ status: 1, branchPath: 1, gender: 1, activatedAt: -1, _id: -1 });
// The review queue.
profileSchema.index({ status: 1, submittedAt: 1 });
profileSchema.index({ status: 1, branchPath: 1, submittedAt: 1 });

export type ProfileDoc = InferSchemaType<typeof profileSchema> & { _id: Types.ObjectId };
export const ProfileModel = model('Profile', profileSchema);
