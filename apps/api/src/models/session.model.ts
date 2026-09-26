import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/**
 * One row per signed-in device. The refresh token is `<sessionId>.<secret>`;
 * only a SHA-256 of the secret is stored. Each refresh rotates the secret and
 * keeps the previous hash so a replayed old token can be detected.
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true },
    previousTokenHash: { type: String, default: null },
    rotatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true },
);

// MongoDB deletes sessions once they expire.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDoc = InferSchemaType<typeof sessionSchema> & { _id: Types.ObjectId };
export const SessionModel = model('Session', sessionSchema);
