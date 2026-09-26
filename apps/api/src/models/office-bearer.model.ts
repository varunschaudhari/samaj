import { OFFICE_POSTS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/** Who holds a post in a branch. Just a name and number: they don't need an account. */
const officeBearerSchema = new Schema(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    branchAncestors: { type: [Schema.Types.ObjectId], default: [] },
    post: { type: String, enum: OFFICE_POSTS, required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export type OfficeBearerDoc = InferSchemaType<typeof officeBearerSchema> & { _id: Types.ObjectId };
export const OfficeBearerModel = model('OfficeBearer', officeBearerSchema);
