import { CANDIDATE_TYPES, REGISTRATION_STATUSES } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/**
 * A vadhu-var parichay melava. The organising branch's committee (and
 * admins) run it. Candidate numbers are handed out from the counters, one
 * sequence for brides and one for grooms, and never reused.
 */
const melavaSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** The day, YYYY-MM-DD. */
    date: { type: String, required: true },
    venue: { type: String, default: null },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    branchAncestors: { type: [Schema.Types.ObjectId], default: [] },
    fee: { type: Number, required: true, default: 0 },
    paymentInstructions: { type: String, default: null },
    registrationOpen: { type: Boolean, default: true },
    counters: {
      bride: { type: Number, default: 0 },
      groom: { type: Number, default: 0 },
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
melavaSchema.index({ date: 1 });

export type MelavaDoc = InferSchemaType<typeof melavaSchema> & { _id: Types.ObjectId };
export const MelavaModel = model('Melava', melavaSchema);

/** One profile's registration for a melava. The number arrives only when the office verifies payment. */
const registrationSchema = new Schema(
  {
    melavaId: { type: Schema.Types.ObjectId, ref: 'Melava', required: true },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    candidateType: { type: String, enum: CANDIDATE_TYPES, required: true },
    status: { type: String, enum: REGISTRATION_STATUSES, default: 'pendingPayment', required: true },
    candidateNumber: { type: Number, default: null },
    paymentRef: { type: String, required: true },
    cancelReason: { type: String, default: null },
    registeredByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    verifiedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
// One registration per profile per melava; a cancelled one is reopened rather than duplicated.
registrationSchema.index({ melavaId: 1, profileId: 1 }, { unique: true });
registrationSchema.index({ melavaId: 1, status: 1, candidateType: 1, candidateNumber: 1 });

export type MelavaRegistrationDoc = InferSchemaType<typeof registrationSchema> & { _id: Types.ObjectId };
export const MelavaRegistrationModel = model('MelavaRegistration', registrationSchema);
