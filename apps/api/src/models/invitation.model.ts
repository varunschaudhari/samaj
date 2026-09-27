import { GUEST_VIAS, INVITATION_KINDS, RSVP_ANSWERS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

const functionSchema = new Schema(
  {
    /** Stable across edits, so answers stay with their function. */
    fid: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    venue: { type: String, required: true, trim: true },
    mapUrl: { type: String, default: null },
  },
  { _id: false },
);

/** A family's invitation: a wedding with its functions, a मुंज, a दशक्रिया. */
const invitationSchema = new Schema(
  {
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    kind: { type: String, enum: INVITATION_KINDS, required: true },
    forNames: { type: String, default: null, trim: true },
    message: { type: String, default: null },
    functions: { type: [functionSchema], default: [] },
    /** The first function's start and the last one's end (or start): for ordering and closing. */
    firstAt: { type: Date, required: true },
    lastAt: { type: Date, required: true },
    sentByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentByName: { type: String, required: true },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);
invitationSchema.index({ familyId: 1, lastAt: -1 });

const answerSchema = new Schema(
  {
    fid: { type: String, required: true },
    answer: { type: String, enum: RSVP_ANSWERS, required: true },
    people: { type: Number, default: 0 },
  },
  { _id: false },
);

/** One household invited, and how it answered. */
const invitationGuestSchema = new Schema(
  {
    invitationId: { type: Schema.Types.ObjectId, ref: 'Invitation', required: true },
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    /** The host family, so a day's sends can be counted without a join. */
    hostFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    via: { type: String, enum: GUEST_VIAS, required: true },
    /** Copied from the invitation, so a guest's list is one query in date order. */
    lastAt: { type: Date, required: true },
    answers: { type: [answerSchema], default: [] },
    respondedByName: { type: String, default: null },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
invitationGuestSchema.index({ invitationId: 1, familyId: 1 }, { unique: true });
invitationGuestSchema.index({ familyId: 1, lastAt: -1 });
invitationGuestSchema.index({ hostFamilyId: 1, createdAt: -1 });

/** A family chose not to see another family's invitations. */
const invitationMuteSchema = new Schema(
  {
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    mutedFamilyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
  },
  { timestamps: true },
);
invitationMuteSchema.index({ familyId: 1, mutedFamilyId: 1 }, { unique: true });
invitationMuteSchema.index({ mutedFamilyId: 1 });

export type InvitationDoc = InferSchemaType<typeof invitationSchema> & { _id: Types.ObjectId };
export type InvitationGuestDoc = InferSchemaType<typeof invitationGuestSchema> & { _id: Types.ObjectId };
export const InvitationModel = model('Invitation', invitationSchema);
export const InvitationGuestModel = model('InvitationGuest', invitationGuestSchema);
export const InvitationMuteModel = model('InvitationMute', invitationMuteSchema);
