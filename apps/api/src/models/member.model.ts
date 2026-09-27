import { FAMILY_STATUSES, GENDERS, GOTRA_IDS, MEMBER_APPROVALS, PHONE_VISIBILITIES, RELATIONS } from '@samaj/shared';
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

    /**
     * 'pending' when the family added this person after it was verified: they
     * wait for the committee. Until then familyStatus is 'pending' too, which
     * keeps them out of the directory, and family status changes pass them by.
     */
    approval: { type: String, enum: MEMBER_APPROVALS, default: 'approved', required: true },
    addedByName: { type: String, default: null },

    /** Who besides the family and its branch committee sees their phone number. */
    phoneVisibility: { type: String, enum: PHONE_VISIBILITIES, default: 'committee', required: true },
    /** false: kept out of the directory and off other families' view; the family and committee still see them. */
    listed: { type: Boolean, default: true, required: true },
    /** Whoever listed this person confirmed they agree (or is their parent or guardian). */
    consentByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    consentAt: { type: Date, default: null },

    /** Passed away: kept in the family and its tree, out of the directory, matrimony, sign-ins and counts. */
    deceased: { type: Boolean, default: false },
    deathYear: { type: Number, default: null },

    /** Whose child they are, where the relation to the head doesn't say (which son a grandchild belongs to). Same family. */
    parentId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    /** Whose wife or husband they are, for someone who married in. Same family. */
    partnerId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    /** Adopted into the family. Only the family and its committee see it. */
    adopted: { type: Boolean, default: false },
    /** A child's other parent, when their parent has had more than one spouse. Same family. */
    otherParentId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    /** Divorced or separated from whoever they married. */
    formerPartner: { type: Boolean, default: false },
    /** Their parent, listed in another family linked to this one (a head's father, a wife's father in her माहेर). */
    externalParentId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
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
// The committee's queue of people added to verified families.
memberSchema.index({ approval: 1, branchPath: 1, createdAt: 1 }, { partialFilterExpression: { approval: 'pending' } });

// The dashboard's count of living people subtracts these, keeping its main count on the index.
memberSchema.index({ familyStatus: 1, branchPath: 1 }, { partialFilterExpression: { deceased: true } });

export type MemberDoc = InferSchemaType<typeof memberSchema> & { _id: Types.ObjectId };
export const MemberModel = model('Member', memberSchema);
