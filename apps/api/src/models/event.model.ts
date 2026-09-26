import { type InferSchemaType, Schema, type Types, model } from 'mongoose';
import { branchPathPlugin } from './plugins';

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    venue: { type: String, required: true, trim: true },
    mapUrl: { type: String, default: null },
    rsvpEnabled: { type: Boolean, default: true },
    /** The branch it is for. Families there and in every branch below see it. */
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    branchAncestors: { type: [Schema.Types.ObjectId], default: [] },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

eventSchema.plugin(branchPathPlugin);

// Upcoming and past events for my branches, or (committee) anywhere under theirs.
eventSchema.index({ branchId: 1, removedAt: 1, startsAt: 1 });
eventSchema.index({ branchPath: 1, removedAt: 1, startsAt: 1 });

export type EventDoc = InferSchemaType<typeof eventSchema> & { _id: Types.ObjectId };
export const EventModel = model('Event', eventSchema);
