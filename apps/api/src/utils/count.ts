import { COUNT_CAP } from '@samaj/shared';
import type { Model } from 'mongoose';

/** countDocuments that stops at COUNT_CAP + 1, so totals over big collections stay cheap. */
export const cappedCount = <T>(model: Model<T>, filter: Record<string, unknown>) => model.countDocuments(filter as never, { limit: COUNT_CAP + 1 });
