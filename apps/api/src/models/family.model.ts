import { FAMILY_STATUSES, GOTRA_IDS, HISTORY_ACTIONS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

const historySchema = new Schema(
  {
    at: { type: Date, required: true },
    action: { type: String, enum: HISTORY_ACTIONS, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, required: true },
    note: { type: String, default: null },
  },
  { _id: false },
);

/**
 * A household. Verification happens here, not per person: the committee
 * reviews a family as a unit, and every member inherits its status.
 */
const familySchema = new Schema(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    /** Copy of the branch's ancestors, so branch-scoped queries need no join. */
    branchAncestors: { type: [Schema.Types.ObjectId], default: [] },
    /** Village, town or city the family lives in, as they write it. */
    place: { type: String, required: true, trim: true },
    /** An id from the fixed list in packages/shared/src/gotras.ts, or null. */
    gotra: { type: String, enum: GOTRA_IDS, default: null },
    address: { type: String, default: null, trim: true },
    status: { type: String, enum: FAMILY_STATUSES, default: 'pending', required: true },
    rejectionReason: { type: String, default: null },
    /** When the family last entered the review queue (signup or resubmission). */
    submittedAt: { type: Date, default: () => new Date() },
    reviewedAt: { type: Date, default: null },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Newest last, capped so the document can't grow without limit. */
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

familySchema.index({ status: 1, submittedAt: 1, _id: 1 });
familySchema.index({ branchId: 1 });
familySchema.index({ branchAncestors: 1 });

export const HISTORY_LIMIT = 50;

export type FamilyDoc = InferSchemaType<typeof familySchema> & { _id: Types.ObjectId };
export const FamilyModel = model('Family', familySchema);
