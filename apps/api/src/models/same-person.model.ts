import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/**
 * A family's word on two entries in linked households: the same person
 * (show once, even though the names don't match), or not (never merge, even
 * though they do). The tree guesses otherwise. `pair` is the two member ids
 * sorted, so there is one record per pair.
 */
const samePersonSchema = new Schema(
  {
    pair: { type: String, required: true, unique: true },
    a: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    b: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    same: { type: Boolean, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, required: true },
  },
  { timestamps: true },
);
samePersonSchema.index({ a: 1 });
samePersonSchema.index({ b: 1 });

export const personPair = (a: Types.ObjectId | string, b: Types.ObjectId | string) => [String(a), String(b)].sort().join(':');

export type SamePersonDoc = InferSchemaType<typeof samePersonSchema> & { _id: Types.ObjectId };
export const SamePersonModel = model('SamePerson', samePersonSchema);
