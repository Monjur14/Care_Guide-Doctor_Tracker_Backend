import { Types } from 'mongoose';

type Plain = Record<string, unknown>;

/** Converts a lean Mongo document to an API DTO: `_id` -> `id`, drops internals. */
export function serialize<T = Plain>(doc: Plain): T {
  const { _id, __v, searchTokens, passwordHash, ...rest } = doc;
  void __v;
  void searchTokens;
  void passwordHash;
  const out: Plain = { id: String(_id) };
  for (const [key, value] of Object.entries(rest)) {
    if (value instanceof Types.ObjectId) out[key] = String(value);
    else if (value && typeof value === 'object' && !(value instanceof Date) && '_id' in value) {
      out[key] = serialize(value as Plain);
    } else out[key] = value;
  }
  return out as T;
}
