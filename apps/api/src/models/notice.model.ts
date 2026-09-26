import { NOTICE_KINDS } from '@samaj/shared';
import { type InferSchemaType, Schema, type Types, model } from 'mongoose';
import { branchPathPlugin } from './plugins';

const noticeSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    kind: { type: String, enum: NOTICE_KINDS, required: true },
    pinned: { type: Boolean, default: false },
    /** The branch it is posted to. Families there and in every branch below see it. */
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    branchAncestors: { type: [Schema.Types.ObjectId], default: [] },
    authorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    publishedAt: { type: Date, default: () => new Date() },
    editedAt: { type: Date, default: null },
    /** Removed notices are kept for the record but never shown. */
    removedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

noticeSchema.plugin(branchPathPlugin);

// The feed: posted to one of my branches, or (committee) anywhere under theirs.
noticeSchema.index({ removedAt: 1, branchId: 1, pinned: 1, publishedAt: -1, _id: -1 });
noticeSchema.index({ removedAt: 1, branchPath: 1, pinned: 1, publishedAt: -1, _id: -1 });

export type NoticeDoc = InferSchemaType<typeof noticeSchema> & { _id: Types.ObjectId };
export const NoticeModel = model('Notice', noticeSchema);
