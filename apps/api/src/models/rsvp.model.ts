import { type InferSchemaType, Schema, type Types, model } from 'mongoose';

/** One family's answer for one event: how many of them are coming. */
const rsvpSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    people: { type: Number, required: true, min: 1 },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

rsvpSchema.index({ eventId: 1, familyId: 1 }, { unique: true });

export type RsvpDoc = InferSchemaType<typeof rsvpSchema> & { _id: Types.ObjectId };
export const RsvpModel = model('Rsvp', rsvpSchema);
