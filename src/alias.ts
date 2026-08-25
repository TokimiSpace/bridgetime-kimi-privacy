import { normalize } from "./normalize.ts";

/**
 * Reversible pseudonymization derived from BridgeTime's private
 * `lib/llm/alias.ts`. The table is server-side state and must never be added
 * to an outbound provider request.
 */
export type AliasEntityType = "staff" | "customer" | "phone" | "email";

export interface AliasEntry {
  token: string;
  type: AliasEntityType;
  id: string;
  display: string;
}

export interface AliasTable {
  entries: AliasEntry[];
}

export interface AliasSubject {
  id: string;
  displayName: string;
}

export function buildAliasTable(
  staff: readonly AliasSubject[],
  customers: readonly AliasSubject[],
  shuffle: (length: number) => number[] = defaultShuffle,
): AliasTable {
  const validStaff = staff.filter((subject) => subject.displayName.trim().length > 0);
  const staffEntries: AliasEntry[] = validStaff.map((subject, index) => ({
    token: `S${index + 1}`,
    type: "staff",
    id: subject.id,
    display: subject.displayName,
  }));

  const validCustomers = customers.filter((subject) => subject.displayName.trim().length > 0);
  const order = shuffle(validCustomers.length);
  assertPermutation(order, validCustomers.length);
  const customerEntries: AliasEntry[] = order.map((originalIndex, index) => ({
    token: `C${index + 1}`,
    type: "customer",
    id: validCustomers[originalIndex].id,
    display: validCustomers[originalIndex].displayName,
  }));

  return { entries: [...staffEntries, ...customerEntries] };
}

function defaultShuffle(length: number): number[] {
  const permutation = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index--) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const otherIndex = random[0] % (index + 1);
    [permutation[index], permutation[otherIndex]] = [
      permutation[otherIndex],
      permutation[index],
    ];
  }
  return permutation;
}

function assertPermutation(order: readonly number[], length: number): void {
  const sorted = [...order].sort((a, b) => a - b);
  const valid = sorted.length === length && sorted.every((value, index) => value === index);
  if (!valid) throw new TypeError("shuffle must return a complete permutation");
}

const MOBILE_RE = /(?<!\d)(?:\+886[-\s]?9|09)\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/g;
const LANDLINE_RE = /(?<!\d)0[2-8][-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function applyAliases(
  text: string,
  table: AliasTable,
): { text: string; table: AliasTable } {
  assertValidAliasTable(table);
  const normalized = normalize(text);

  const phoneMasked = maskByRegex(
    normalized,
    table.entries,
    [MOBILE_RE, LANDLINE_RE],
    "phone",
    "P",
  );
  const tableAfterPhone: AliasTable = {
    entries: [...table.entries, ...phoneMasked.newEntries],
  };

  const emailMasked = maskByRegex(
    phoneMasked.text,
    tableAfterPhone.entries,
    [EMAIL_RE],
    "email",
    "E",
  );
  const tableAfterEmail: AliasTable = {
    entries: [...tableAfterPhone.entries, ...emailMasked.newEntries],
  };

  const names = tableAfterEmail.entries.filter((entry) =>
    entry.type === "staff" || entry.type === "customer"
  );
  return { text: maskNames(emailMasked.text, names), table: tableAfterEmail };
}

function maskByRegex(
  text: string,
  existingEntries: readonly AliasEntry[],
  regexes: readonly RegExp[],
  type: "phone" | "email",
  prefix: "P" | "E",
): { text: string; newEntries: AliasEntry[] } {
  const byValue = new Map<string, AliasEntry>();
  let maxIndex = 0;
  for (const entry of existingEntries) {
    if (entry.type !== type) continue;
    byValue.set(entry.id, entry);
    const index = Number(entry.token.slice(prefix.length));
    if (Number.isFinite(index) && index > maxIndex) maxIndex = index;
  }

  const matches: Array<{ start: number; end: number; raw: string }> = [];
  for (const regex of regexes) {
    for (const match of text.matchAll(regex)) {
      const start = match.index ?? 0;
      matches.push({ start, end: start + match[0].length, raw: match[0] });
    }
  }
  matches.sort((left, right) => left.start - right.start);

  const newEntries: AliasEntry[] = [];
  let result = "";
  let cursor = 0;
  for (const { start, end, raw } of matches) {
    if (start < cursor) continue;
    let entry = byValue.get(raw);
    if (!entry) {
      maxIndex += 1;
      entry = { token: `${prefix}${maxIndex}`, type, id: raw, display: raw };
      byValue.set(raw, entry);
      newEntries.push(entry);
    }
    result += text.slice(cursor, start) + entry.token;
    cursor = end;
  }
  result += text.slice(cursor);
  return { text: result, newEntries };
}

interface NameCandidate {
  start: number;
  end: number;
  entry: AliasEntry;
}

function findNameCandidates(
  text: string,
  entries: readonly AliasEntry[],
): NameCandidate[] {
  const candidates: NameCandidate[] = [];
  for (const entry of entries) {
    const normalizedName = normalize(entry.display);
    if (!normalizedName) continue;
    const escaped = escapeRegExp(normalizedName);
    const pattern = isPureAscii(normalizedName)
      ? `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`
      : escaped;
    for (const match of text.matchAll(new RegExp(pattern, "g"))) {
      const start = match.index ?? 0;
      candidates.push({ start, end: start + normalizedName.length, entry });
    }
  }
  return candidates.sort((left, right) =>
    left.start - right.start || (right.end - right.start) - (left.end - left.start)
  );
}

function maskNames(text: string, entries: readonly AliasEntry[]): string {
  let result = "";
  let cursor = 0;
  for (const candidate of findNameCandidates(text, entries)) {
    if (candidate.start < cursor) continue;
    result += text.slice(cursor, candidate.start) + candidate.entry.token;
    cursor = candidate.end;
  }
  return result + text.slice(cursor);
}

function isPureAscii(value: string): boolean {
  return /^[\x00-\x7F]*$/.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function restoreAliases(text: string, table: AliasTable): string {
  assertValidAliasTable(table);
  const entries = [...table.entries].sort((left, right) => right.token.length - left.token.length);
  let restored = text;
  for (const entry of entries) {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.token)}\\b`, "g");
    restored = restored.replace(pattern, () => entry.display);
  }
  return restored;
}

export function resolveAlias(table: AliasTable, token: string): AliasEntry | null {
  assertValidAliasTable(table);
  return table.entries.find((entry) => entry.token === token) ?? null;
}

export function assertValidAliasTable(table: AliasTable): void {
  const tokens = new Set<string>();
  for (const entry of table.entries) {
    const prefix = entry.type === "staff"
      ? "S"
      : entry.type === "customer"
      ? "C"
      : entry.type === "phone"
      ? "P"
      : "E";
    if (!new RegExp(`^${prefix}[1-9]\\d*$`).test(entry.token)) {
      throw new TypeError("alias table contains an invalid token");
    }
    if (tokens.has(entry.token)) throw new TypeError("alias table contains duplicate tokens");
    if (!entry.id || !entry.display) throw new TypeError("alias table contains a blank value");
    tokens.add(entry.token);
  }
}
