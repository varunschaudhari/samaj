import { BRANCH_KINDS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

const branchSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    nameMr: { type: String, required: true, trim: true },
    kind: { type: String, enum: BRANCH_KINDS, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
    /**
     * Every branch above this one, root first. Lets us select a whole subtree
     * with one indexed query: { $or: [{ _id: id }, { ancestors: id }] }.
     */
    ancestors: { type: [Schema.Types.ObjectId], default: [], index: true },
  },
  { timestamps: true },
);

export type BranchDoc = InferSchemaType<typeof branchSchema> & { _id: Types.ObjectId };
export const BranchModel = model('Branch', branchSchema);
