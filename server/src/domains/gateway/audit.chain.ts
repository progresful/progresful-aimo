import { canonicalJson, sha256 } from './gateway.signing.ts';

// Pure hash-chain helpers. Every entry commits to its own content and to the
// previous entry's hash, so changing or dropping any entry breaks every hash
// after it.

export const GENESIS_HASH = '0'.repeat(64);

export type ChainFields = {
  seq: number;
  at: string; // ISO timestamp
  orderId: string | null;
  step: string;
  status: string;
  actor: string;
  message: string;
  payload: unknown;
};

export type ChainEntry = ChainFields & { prevHash: string; hash: string };

export const entryHash = (fields: ChainFields, prevHash: string) =>
  sha256(
    canonicalJson({
      seq: fields.seq,
      at: fields.at,
      orderId: fields.orderId ?? null,
      step: fields.step,
      status: fields.status,
      actor: fields.actor,
      message: fields.message,
      payload: fields.payload ?? {},
    }) + prevHash
  );

export const linkEntry = (fields: ChainFields, prevHash: string): ChainEntry => ({ ...fields, prevHash, hash: entryHash(fields, prevHash) });

export type ChainVerification = { ok: boolean; entries: number; head: string; brokenAt?: number; reason?: string };

/** Recomputes the chain from genesis. `entries` must be sorted by seq. */
export const verifyChain = (entries: ChainEntry[]): ChainVerification => {
  let prev = GENESIS_HASH;
  for (const e of entries) {
    if (e.prevHash !== prev) return { ok: false, entries: entries.length, head: prev, brokenAt: e.seq, reason: 'prevHash does not link to the previous entry' };
    if (entryHash(e, prev) !== e.hash) return { ok: false, entries: entries.length, head: prev, brokenAt: e.seq, reason: 'hash does not match the entry content' };
    prev = e.hash;
  }
  return { ok: true, entries: entries.length, head: prev };
};

/** "3e7d…a01b" */
export const shortHash = (hash: string) => `${hash.slice(0, 4)}…${hash.slice(-4)}`;
