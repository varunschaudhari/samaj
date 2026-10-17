import { MARK_KINDS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/**
 * A family's private note on another profile, made while searching for one
 * of its own: shortlisted to look at again, or passed on. Only that family
 * ever sees it; the other family is never told.
 */
const markSchema = new Schema(
  {
    fromProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    fromFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    kind: { type: String, enum: MARK_KINDS, required: true },
  },
  { timestamps: true },
);
markSchema.index({ fromProfileId: 1, profileId: 1 }, { unique: true });
markSchema.index({ fromProfileId: 1, kind: 1, updatedAt: -1 });

export type MarkDoc = InferSchemaType<typeof markSchema> & { _id: Types.ObjectId };
export const MarkModel = model('ProfileMark', markSchema);
