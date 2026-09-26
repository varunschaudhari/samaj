import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/**
 * A one-time code a committee member or admin creates for someone who forgot
 * their password. Only a SHA-256 of the code is stored. Creating a new code
 * replaces any earlier one for the same user.
 */
const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String, required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    /** Wrong guesses so far. The code stops working at MAX_RESET_ATTEMPTS. */
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// MongoDB removes codes once they expire.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetDoc = InferSchemaType<typeof passwordResetSchema> & { _id: Types.ObjectId };
export const PasswordResetModel = model('PasswordReset', passwordResetSchema);
