import { INTEREST_STATUSES } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/** One family's interest in another's profile, sent on behalf of one of their own profiles. */
const interestSchema = new Schema(
  {
    fromProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    toProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    fromFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    toFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    status: { type: String, enum: INTEREST_STATUSES, default: 'pending', required: true },
    sentByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One interest per direction per pair.
interestSchema.index({ fromProfileId: 1, toProfileId: 1 }, { unique: true });
interestSchema.index({ toProfileId: 1, status: 1 });
interestSchema.index({ fromFamilyId: 1 });
interestSchema.index({ toFamilyId: 1 });

export type InterestDoc = InferSchemaType<typeof interestSchema> & { _id: Types.ObjectId };
export const InterestModel = model('Interest', interestSchema);
