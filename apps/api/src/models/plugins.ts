import { nameKeys } from '@samaj/shared';
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

/** Every prefix of the spelling-tolerant key of every word (see nameKey), for all the given texts. */
export function keyTokens(...texts: (string | null | undefined)[]): string[] {
  const tokens = new Set<string>();
  for (const key of texts.flatMap(nameKeys)) {
    const chars = [...key];
    for (let i = 1; i <= Math.min(chars.length, MAX_PREFIX); i++) tokens.add(chars.slice(0, i).join(''));
  }
  return [...tokens];
}

/**
 * `keyTokens` from several name fields together (a name and the name before
 * marriage), so a search finds a name typed in Marathi or spelt another way.
 */
export function nameKeysPlugin(schema: Schema, fields: string[]) {
  schema.add({ keyTokens: { type: [String], default: [], select: false } });
  schema.pre('validate', function () {
    if (this.isNew || fields.some((f) => this.isModified(f))) this.set('keyTokens', keyTokens(...fields.map((f) => this.get(f) as string | null)));
  });
  schema.pre('insertMany', function (docs: unknown) {
    for (const doc of [docs].flat() as Record<string, unknown>[]) doc.keyTokens = keyTokens(...fields.map((f) => doc[f] as string | null));
  });
  // An update carries only the fields it changes: keys come from those.
  onUpdate(schema, fields, (_field, _value, set) => {
    set.keyTokens = keyTokens(...fields.map((f) => set[f] as string | null));
  });
}
