import { CLOSE_REASONS, GENDERS, GOTRA_IDS, INCOME_RANGES, MANGLIK, PROFILE_STATUSES } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';
import { branchPathPlugin } from './plugins';

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
    education: { type: String, default: null },
    occupation: { type: String, default: null },
    income: { type: String, enum: INCOME_RANGES, default: null },
    manglik: { type: String, enum: MANGLIK, default: null },
    maternalGotra: { type: String, enum: GOTRA_IDS, default: null },
    about: { type: String, default: null },
    expectations: { type: String, default: null },
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
