import { FAMILY_STATUSES, GENDERS, GOTRA_IDS, RELATIONS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';
import { branchPathPlugin, searchTokensPlugin } from './plugins';

/**
 * A person in a family. Separate from User because most people in a family
 * (children, elders) will never have an account.
 *
 * branchId, branchAncestors, place, gotra and familyStatus are copied from the
 * family so the directory can filter and search members without a join. The
 * family service keeps them in sync.
 */
const memberSchema = new Schema(
  {
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    name: { type: String, required: true, trim: true },
    relation: { type: String, enum: RELATIONS, required: true },
    isHead: { type: Boolean, default: false },
    gender: { type: String, enum: GENDERS, required: true },
    birthYear: { type: Number, default: null },
    occupation: { type: String, default: null, trim: true },
    education: { type: String, default: null, trim: true },
    phone: { type: String, default: null },
    /** Storage key of the photo, if any. Served through GET /api/members/:id/photo. */
    photoKey: { type: String, default: null },
    /** Bumped on each photo change so browsers fetch the new one. */
    photoVersion: { type: Number, default: 0 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Copied from the family.
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    branchAncestors: { type: [Schema.Types.ObjectId], default: [] },
    place: { type: String, required: true, trim: true },
    gotra: { type: String, enum: GOTRA_IDS, default: null },
    familyStatus: { type: String, enum: FAMILY_STATUSES, default: 'pending', required: true },
  },
  { timestamps: true },
);

memberSchema.plugin(branchPathPlugin);
memberSchema.plugin(searchTokensPlugin, ['name', 'place', 'occupation']);

// The directory: browse everyone, a branch, or a gotra, in name order.
memberSchema.index({ familyStatus: 1, name: 1, _id: 1 });
memberSchema.index({ familyStatus: 1, branchPath: 1, name: 1, _id: 1 });
memberSchema.index({ familyStatus: 1, gotra: 1, name: 1, _id: 1 });
// Directory search: one index per searched field, which the query ORs. Each
// ends in the sort, so a common surname reads one page, not every match.
memberSchema.index({ familyStatus: 1, nameTokens: 1, name: 1, _id: 1 });
memberSchema.index({ familyStatus: 1, placeTokens: 1, name: 1, _id: 1 });
memberSchema.index({ familyStatus: 1, occupationTokens: 1, name: 1, _id: 1 });
// Signup and enrolment look for an unclaimed person with this number.
memberSchema.index({ phone: 1 });
// Renaming a branch renames the place of families written as the old name.
memberSchema.index({ branchId: 1, place: 1 });
memberSchema.index({ familyId: 1, isHead: 1 });

export type MemberDoc = InferSchemaType<typeof memberSchema> & { _id: Types.ObjectId };
export const MemberModel = model('Member', memberSchema);
