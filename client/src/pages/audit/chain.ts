// Browser-side re-computation of the audit hash chain. Mirrors
// server/src/domains/gateway/audit.chain.ts + gateway.signing.ts exactly:
//   hash = sha256(canonicalJson({seq, at, orderId, step, status, actor, message, payload}) + prevHash)
// canonicalJson = JSON.stringify with object keys sorted recursively, undefined
// keys dropped, no whitespace.
import type { AuditEntry } from '@/api/gateway';

export const GENESIS_HASH = '0'.repeat(64);

const sortKeys = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort()
        .map((k) => [k, sortKeys(obj[k])])
    );
  }
  return value;
};

export const canonicalJson = (value: unknown) => JSON.stringify(sortKeys(value));

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export const sha256Hex = async (input: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));

/** The hash the entry should carry, given its content and its own prevHash. */
export const recomputeHash = (e: AuditEntry) =>
  sha256Hex(
    canonicalJson({
      seq: e.seq,
      at: e.at,
      orderId: e.orderId ?? null,
      step: e.step,
      status: e.status,
      actor: e.actor,
      message: e.message,
      payload: e.payload ?? {},
    }) + e.prevHash
  );

export type EntryCheck = { seq: number; ok: boolean; recomputed: string; reason?: string };

/**
 * Checks every loaded entry: its content hashes to its `hash`, and its
 * `prevHash` is the hash of the entry before it (when that entry is loaded too;
 * the first entry must link to genesis).
 */
export const checkEntries = async (entries: AuditEntry[]): Promise<Map<number, EntryCheck>> => {
  const bySeq = new Map(entries.map((e) => [e.seq, e]));
  const out = new Map<number, EntryCheck>();
  await Promise.all(
    entries.map(async (e) => {
      const recomputed = await recomputeHash(e);
      const prev = bySeq.get(e.seq - 1);
      let reason: string | undefined;
      if (recomputed !== e.hash) reason = 'Content does not hash to the stored hash';
      else if (prev && prev.hash !== e.prevHash) reason = `prevHash does not match entry #${prev.seq}`;
      else if (e.seq === 1 && e.prevHash !== GENESIS_HASH) reason = 'First entry does not link to genesis';
      out.set(e.seq, { seq: e.seq, ok: !reason, recomputed, reason });
    })
  );
  return out;
};

/** "3e7d…a01b" */
export const shortHash = (hash: string) => `${hash.slice(0, 4)}…${hash.slice(-4)}`;
