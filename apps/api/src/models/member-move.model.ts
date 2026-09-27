import { MOVE_STATUSES, RELATIONS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';
import { branchPathPlugin } from './plugins';

/**
 * A person moving from one family to another, usually after marriage. The new
 * family asks, the old family agrees, the new family's branch committee
 * approves. branchId and branchAncestors are the new family's, so the
 * committee's queue is a branchPath query.
 */
const memberMoveSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    memberName: { type: String, required: true },
    fromFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    toFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    /** Their relation in the new family. */
    relation: { type: String, enum: RELATIONS, required: true },
    note: { type: String, default: null },
    status: { type: String, enum: MOVE_STATUSES, default: 'awaitingFamily', required: true },
    requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, required: true },
    agreedByName: { type: String, default: null },
    agreedAt: { type: Date, default: null },
    decidedByName: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    declineReason: { type: String, default: null },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    branchAncestors: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

memberMoveSchema.plugin(branchPathPlugin);
// One open move per person.
memberMoveSchema.index({ memberId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['awaitingFamily', 'awaitingCommittee'] } } });
memberMoveSchema.index({ fromFamilyId: 1, status: 1 });
memberMoveSchema.index({ toFamilyId: 1, status: 1 });
// The committee's queue.
memberMoveSchema.index({ status: 1, branchPath: 1, createdAt: 1 });

export type MemberMoveDoc = InferSchemaType<typeof memberMoveSchema> & { _id: Types.ObjectId };
export const MemberMoveModel = model('MemberMove', memberMoveSchema);
