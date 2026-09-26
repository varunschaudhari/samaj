import { ROLES } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/** Audit trail of every role or scope change, kept even if the user is later removed. */
const roleChangeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, required: true },
    fromRole: { type: String, enum: ROLES, required: true },
    toRole: { type: String, enum: ROLES, required: true },
    fromBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
    toBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type RoleChangeDoc = InferSchemaType<typeof roleChangeSchema> & { _id: Types.ObjectId };
export const RoleChangeModel = model('RoleChange', roleChangeSchema);
