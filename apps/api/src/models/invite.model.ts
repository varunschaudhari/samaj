import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/**
 * A one-time code that lets a person already listed in a family create their
 * own sign-in to that family. The family or its committee creates it and hands
 * it over by phone or in person. Only a SHA-256 of the code is stored, and a
 * new code replaces any earlier one for the same person.
 */
const inviteSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, unique: true },
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    codeHash: { type: String, required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    /** Wrong guesses so far. The code stops working at MAX_INVITE_ATTEMPTS. */
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// MongoDB removes codes once they expire.
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type InviteDoc = InferSchemaType<typeof inviteSchema> & { _id: Types.ObjectId };
export const InviteModel = model('Invite', inviteSchema);
