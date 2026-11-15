import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENESIS_HASH, entryHash, linkEntry, verifyChain } from '../audit.chain.ts';
import type { ChainEntry } from '../audit.chain.ts';
import { canonicalJson, sign, verify } from '../gateway.signing.ts';

const build = (n: number) => {
  const entries: ChainEntry[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= n; i++) {
    const e = linkEntry({ seq: i, at: new Date(Date.UTC(2026, 10, 16, 9, 0, i)).toISOString(), orderId: 'VA-20480', step: 'request', status: 'auto', actor: 'gateway', message: `entry ${i}`, payload: { n: i, nested: { b: 2, a: 1 } } }, prev);
    entries.push(e);
    prev = e.hash;
  }
  return entries;
};

test('canonical JSON ignores key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: null } }), canonicalJson({ a: { c: null, d: [1, { x: 2, y: 1 }] }, b: 1 }));
});

test('a fresh chain verifies, starting from 64 zeros', () => {
  const chain = build(5);
  assert.equal(chain[0].prevHash, '0'.repeat(64));
  const result = verifyChain(chain);
  assert.equal(result.ok, true);
  assert.equal(result.entries, 5);
  assert.equal(result.head, chain[4].hash);
});

test('editing any entry breaks the chain at that entry', () => {
  const chain = build(5);
  chain[2] = { ...chain[2], message: 'entry 3 (edited)' };
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 3);
});

test('re-hashing an edited entry still breaks the link to the next one', () => {
  const chain = build(5);
  const edited = { ...chain[1], payload: { n: 999 } };
  chain[1] = { ...edited, hash: entryHash(edited, edited.prevHash) };
  assert.equal(verifyChain(chain).brokenAt, 3);
});

test('dropping an entry is detected', () => {
  const chain = build(4);
  chain.splice(1, 1);
  assert.equal(verifyChain(chain).ok, false);
});

test('ed25519 signatures verify and fail on tampering', () => {
  const quote = { id: 'qt_X', lines: [{ code: '464398', unitPrice: 1.39 }], total: 556 };
  const signature = sign(quote);
  assert.match(signature, /^ed25519:/);
  assert.equal(verify({ total: 556, lines: [{ unitPrice: 1.39, code: '464398' }], id: 'qt_X' }, signature), true);
  assert.equal(verify({ ...quote, total: 1 }, signature), false);
});
