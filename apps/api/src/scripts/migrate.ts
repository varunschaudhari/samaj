/*
 * Brings a database up to date with the code: builds the indexes the models
 * declare (dropping ones they no longer declare), and fills derived fields on
 * records written before those fields existed. Safe to run again.
 *
 * Production servers don't build indexes at boot (see config/db.ts), so run
 * this once per release, before starting the new version:
 *   npm run db:migrate                      (development, from the repo root)
 *   node apps/api/dist/migrate.js           (a built deployment)
 */
import mongoose, { type Model } from 'mongoose';
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { BranchModel } from '../models/branch.model';
import { EventModel } from '../models/event.model';
import { FamilyLinkModel } from '../models/family-link.model';
import { MemberMoveModel } from '../models/member-move.model';
import { FamilyModel } from '../models/family.model';
import { InterestModel } from '../models/interest.model';
import { InviteModel } from '../models/invite.model';
import { MemberModel } from '../models/member.model';
import { NoticeModel } from '../models/notice.model';
import { OfficeBearerModel } from '../models/office-bearer.model';
import { PasswordResetModel } from '../models/password-reset.model';
import { prefixTokens } from '../models/plugins';
import { ProfileModel } from '../models/profile.model';
import { RoleChangeModel } from '../models/role-change.model';
import { RsvpModel } from '../models/rsvp.model';
import { SessionModel } from '../models/session.model';
import { UserModel } from '../models/user.model';
import { logger } from '../utils/logger';

const BATCH = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>;

/** Walks records matching `missing` and writes what `derive` returns, a batch at a time. */
async function backfill(model: AnyModel, missing: Record<string, unknown>, fields: string[], derive: (doc: Record<string, unknown>) => Record<string, unknown>) {
  let done = 0;
  let batch: Parameters<AnyModel['bulkWrite']>[0] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    await model.collection.bulkWrite(batch as never, { ordered: false });
    done += batch.length;
    batch = [];
  };
  const projection = Object.fromEntries(fields.map((f) => [f, 1]));
  for await (const doc of model.collection.find(missing, { projection })) {
    batch.push({ updateOne: { filter: { _id: doc._id }, update: { $set: derive(doc) } } });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  if (done) logger.info({ collection: model.collection.name, records: done }, 'Filled derived fields');
}

const pathOf = (doc: Record<string, unknown>) => ({
  branchPath: doc.branchId ? [doc.branchId, ...((doc.branchAncestors as unknown[] | undefined) ?? [])] : [],
});
const tokensOf = (fields: string[]) => (doc: Record<string, unknown>) =>
  Object.fromEntries(fields.map((f) => [`${f}Tokens`, prefixTokens(doc[f] as string | null)]));

async function main() {
  await connectDb(env.MONGODB_URI);

  for (const model of [MemberModel, FamilyModel, ProfileModel, NoticeModel, EventModel] as AnyModel[]) {
    await backfill(model, { branchPath: { $exists: false } }, ['branchId', 'branchAncestors'], pathOf);
  }
  await backfill(MemberModel, { nameTokens: { $exists: false } }, ['name', 'place', 'occupation'], tokensOf(['name', 'place', 'occupation']));
  await backfill(UserModel, { nameTokens: { $exists: false } }, ['name'], tokensOf(['name']));
  // People listed before committee approval of additions existed.
  await backfill(MemberModel, { approval: { $exists: false } }, [], () => ({ approval: 'approved' }));
  // Privacy settings arrived later: keep numbers with the family and committee, and keep people listed.
  await backfill(MemberModel, { phoneVisibility: { $exists: false } }, [], () => ({ phoneVisibility: 'committee', listed: true }));

  const models: AnyModel[] = [
    BranchModel, EventModel, FamilyLinkModel, FamilyModel, InterestModel, MemberMoveModel, InviteModel, MemberModel, NoticeModel, OfficeBearerModel,
    PasswordResetModel, ProfileModel, RoleChangeModel, RsvpModel, SessionModel, UserModel,
  ];
  for (const model of models) {
    const dropped = await model.syncIndexes();
    logger.info({ collection: model.collection.name, dropped }, 'Indexes in step');
  }
  await mongoose.connection.collection('rate_limits').createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 });

  await disconnectDb();
}

main().catch(async (err: unknown) => {
  logger.fatal({ err }, 'Migration failed');
  await disconnectDb();
  process.exit(1);
});
