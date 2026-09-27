import { LINK_KINDS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/**
 * Two families that belong together: a son's household and his parents',
 * in-laws, relatives. `kind` is what the other family is to the one that
 * proposed it; the other side reads the inverse (see INVERSE_LINK).
 */
const familyLinkSchema = new Schema(
  {
    fromFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    toFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    kind: { type: String, enum: LINK_KINDS, required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending', required: true },
    /** Both ids, sorted: one link per pair of families, whichever side proposed it. */
    pair: { type: String, required: true, unique: true },
    requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, required: true },
    acceptedByName: { type: String, default: null },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

familyLinkSchema.index({ fromFamilyId: 1, status: 1 });
familyLinkSchema.index({ toFamilyId: 1, status: 1 });

export const linkPair = (a: Types.ObjectId | string, b: Types.ObjectId | string) => [String(a), String(b)].sort().join(':');

export type FamilyLinkDoc = InferSchemaType<typeof familyLinkSchema> & { _id: Types.ObjectId };
export const FamilyLinkModel = model('FamilyLink', familyLinkSchema);
