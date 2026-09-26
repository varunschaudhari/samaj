import type { Schema, Types } from 'mongoose';

/*
 * Derived fields that exist only so queries can use an index. Each is computed
 * from fields on the same record, in hooks, so no service can forget them.
 */

type Update = Record<string, unknown> & { $set?: Record<string, unknown> };

/** Calls derive() with each changed source field, for both `{ f }` and `{ $set: { f } }` updates. */
function onUpdate(schema: Schema, sources: string[], derive: (field: string, value: unknown, set: Record<string, unknown>) => void) {
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
    const update = this.getUpdate() as Update | null;
    if (!update || Array.isArray(update)) return;
    // Plain keys in an update are a $set; fold them in so both forms read the same.
    const operators = Object.fromEntries(Object.entries(update).filter(([k]) => k.startsWith('$')));
    const set: Record<string, unknown> = { ...Object.fromEntries(Object.entries(update).filter(([k]) => !k.startsWith('$'))), ...update.$set };
    const changed = sources.filter((field) => set[field] !== undefined);
    if (changed.length === 0) return;
    for (const field of changed) derive(field, set[field], set);
    this.setUpdate({ ...operators, $set: set });
  });
}

/**
 * branchPath: the record's branch followed by that branch's ancestors. "In
 * branch X or anywhere below it" becomes { branchPath: X }, which one compound
 * index serves together with the sort, instead of an $or over two fields.
 */
export function branchPathPlugin(schema: Schema) {
  schema.add({ branchPath: { type: [{ type: 'ObjectId' }], default: [] } });

  const pathOf = (branchId: unknown, ancestors: unknown) => (branchId ? [branchId, ...((ancestors as Types.ObjectId[] | undefined) ?? [])] : []);

  schema.pre('validate', function () {
    if (this.isNew || this.isModified('branchId') || this.isModified('branchAncestors')) {
      this.set('branchPath', pathOf(this.get('branchId'), this.get('branchAncestors')));
    }
  });
  schema.pre('insertMany', function (docs: unknown) {
    for (const doc of [docs].flat() as Record<string, unknown>[]) doc.branchPath = pathOf(doc.branchId, doc.branchAncestors);
  });
  onUpdate(schema, ['branchId'], (_field, value, set) => {
    set.branchPath = pathOf(value, set.branchAncestors);
  });
}

const MAX_PREFIX = 24;

/**
 * Every prefix of every word, lower-cased: "Sunita Chaudhari" gives s, su, …,
 * sunita, c, ch, …. Searching "cha" is then an exact match on an indexed array,
 * where a word-start regex would read every record.
 */
export function prefixTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const tokens = new Set<string>();
  for (const word of text.normalize('NFC').toLocaleLowerCase('en-IN').split(/[\s,./()'"-]+/u)) {
    const chars = [...word];
    for (let i = 1; i <= Math.min(chars.length, MAX_PREFIX); i++) tokens.add(chars.slice(0, i).join(''));
  }
  return [...tokens];
}

/** The words of a search box, in the same form as prefixTokens stores them. */
export function searchWords(q: string): string[] {
  return [...new Set(q.normalize('NFC').toLocaleLowerCase('en-IN').split(/[\s,./()'"-]+/u).filter(Boolean).map((w) => [...w].slice(0, MAX_PREFIX).join('')))];
}

/** Adds `<field>Tokens` for each field, kept in step with the field. */
export function searchTokensPlugin(schema: Schema, fields: string[]) {
  for (const field of fields) schema.add({ [`${field}Tokens`]: { type: [String], default: [], select: false } });

  schema.pre('validate', function () {
    for (const field of fields) {
      if (this.isNew || this.isModified(field)) this.set(`${field}Tokens`, prefixTokens(this.get(field) as string | null));
    }
  });
  schema.pre('insertMany', function (docs: unknown) {
    for (const doc of [docs].flat() as Record<string, unknown>[]) {
      for (const field of fields) doc[`${field}Tokens`] = prefixTokens(doc[field] as string | null);
    }
  });
  onUpdate(schema, fields, (field, value, set) => {
    set[`${field}Tokens`] = prefixTokens(value as string | null);
  });
}
