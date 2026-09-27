import { DELETION_SCOPES, LANGUAGES, ROLES } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';
import { searchTokensPlugin } from './plugins';

const userSchema = new Schema(
  {
    /** E.164, normalised by phoneSchema. This is the login identifier. */
    phone: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'member', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    language: { type: String, enum: LANGUAGES, default: 'en', required: true },
    /** The family this account belongs to, and the person within it. Both created at signup. */
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },

    /** The privacy notice version they agreed to, and when. Null until they do. */
    consentVersion: { type: String, default: null },
    consentAt: { type: Date, default: null },
    /** A deletion they asked for, carried out at deletionDueAt unless they cancel. */
    deletionScope: { type: String, enum: DELETION_SCOPES, default: null },
    deletionDueAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// People (admin): everyone or one role, in name order. Committee per branch.
userSchema.plugin(searchTokensPlugin, ['name']);
userSchema.index({ nameTokens: 1, name: 1, _id: 1 });
userSchema.index({ name: 1, _id: 1 });
userSchema.index({ role: 1, name: 1, _id: 1 });
userSchema.index({ branchId: 1, role: 1 });
userSchema.index({ branchId: 1, name: 1, _id: 1 });
// The hourly purge of deletions that are due.
userSchema.index({ deletionDueAt: 1 }, { partialFilterExpression: { deletionDueAt: { $type: 'date' } } });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const UserModel = model('User', userSchema);
