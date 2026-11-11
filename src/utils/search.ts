/**
 * Prefix search backed by a multikey index on `searchTokens`.
 *
 * Each document stores lower-cased, accent-free word tokens of its searchable
 * fields. A query like "joh smi" becomes
 *   { searchTokens: { $all: [/^joh/, /^smi/] } }
 * Anchored, case-sensitive regexes on a normalised field can use index bounds,
 * unlike an unanchored /john/i over the raw name, which scans every document.
 */

const MAX_TERMS = 5;

export function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function words(value: string): string[] {
  return normalize(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function buildSearchTokens(fields: { text?: (string | undefined)[]; phone?: string; email?: string }) {
  const tokens = new Set<string>();
  for (const value of fields.text ?? []) {
    if (value) words(value).forEach((w) => tokens.add(w));
  }
  if (fields.email) {
    const email = normalize(fields.email);
    words(email).forEach((w) => tokens.add(w));
  }
  if (fields.phone) {
    const digits = fields.phone.replace(/\D/g, '');
    if (digits) tokens.add(digits);
    words(fields.phone).forEach((w) => tokens.add(w));
    // Allow local-format search, e.g. "01711" for "+880 1711 …".
    if (digits.startsWith('880')) tokens.add(`0${digits.slice(3)}`);
  }
  return [...tokens];
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchFilter(search: string | undefined): Record<string, unknown> {
  if (!search) return {};
  const terms = [...new Set(words(search))].slice(0, MAX_TERMS);
  if (terms.length === 0) return {};
  return { searchTokens: { $all: terms.map((t) => new RegExp(`^${escapeRegex(t)}`)) } };
}
