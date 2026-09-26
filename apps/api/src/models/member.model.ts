import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/**
 * A person in the samaj directory. Separate from User because most people in
 * a family (children, elders) will never have an account.
 */
const memberSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    familyHead: { type: String, default: null, trim: true },
    gotra: { type: String, default: null, trim: true },
    /** Village, town or city the family lives in, as they write it. */
    place: { type: String, required: true, trim: true },
    occupation: { type: String, default: null, trim: true },
    phone: { type: String, default: null },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    /** Copy of the branch's ancestors, so branch-scoped queries need no join. */
    branchAncestors: { type: [Schema.Types.ObjectId], default: [] },
    verified: { type: Boolean, default: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

memberSchema.index({ name: 1, _id: 1 });
memberSchema.index({ branchId: 1, name: 1 });
memberSchema.index({ branchAncestors: 1 });
memberSchema.index({ gotra: 1 });

export type MemberDoc = InferSchemaType<typeof memberSchema> & { _id: Types.ObjectId };
export const MemberModel = model('Member', memberSchema);
