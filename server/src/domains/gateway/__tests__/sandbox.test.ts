import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUDGE, SANDBOX_POLICY_KEY, isSandboxMetadata, parseOrgMetadata, sandboxDocument, sandboxRules, withResetAt } from '../gateway.sandbox.logic.ts';
import { approverOf } from '../policy.compiler.ts';
import { buildDraft, evaluate } from '../policy.engine.ts';
import { P, products } from './fixtures.ts';

test('org metadata: only { sandbox: true } marks a sandbox; junk parses as empty', () => {
  assert.equal(isSandboxMetadata(JSON.stringify({ sandbox: true })), true);
  assert.equal(isSandboxMetadata(JSON.stringify({ sandbox: 'true' })), false);
  assert.equal(isSandboxMetadata(null), false);
  assert.equal(isSandboxMetadata('not json'), false);
  assert.equal(isSandboxMetadata('[1]'), false);
  assert.deepEqual(parseOrgMetadata('{"a":1}'), { a: 1 });
});

test('withResetAt keeps other metadata and stays a sandbox', () => {
  const at = new Date('2026-11-14T10:00:00.000Z');
  assert.deepEqual(JSON.parse(withResetAt('{"logo":"x"}', at)), { logo: 'x', sandbox: true, resetAt: '2026-11-14T10:00:00.000Z' });
  assert.deepEqual(JSON.parse(withResetAt(null, at)), { sandbox: true, resetAt: '2026-11-14T10:00:00.000Z' });
});

test('sandbox policy (seed and reset): starts empty — only the approval route, to the judge', () => {
  const doc = sandboxDocument();
  assert.equal(doc.id, SANDBOX_POLICY_KEY);
  assert.equal(doc.version, 1);
  assert.deepEqual(
    doc.rules.map((r) => r.type),
    ['approval']
  );
  // No spend limits, no category allow-list, no lactose / data rules.
  for (const t of ['limit.perOrder', 'limit.perWeek', 'category.allow', 'nutrition', 'data.missing', 'allergen.exclude', 'product.attribute']) assert.ok(!doc.rules.some((r) => r.type === t), t);
  const approver = approverOf(doc);
  assert.equal(approver.name, JUDGE.name);
  assert.equal(approver.role, JUDGE.role);
  assert.deepEqual(doc.approvers[0], { name: JUDGE.name, role: JUDGE.role, window_minutes: approver.windowMinutes });
  assert.deepEqual(sandboxRules(), doc.rules);
  // A later version (a reset re-signs v1) is just as empty.
  assert.deepEqual(sandboxDocument(3).rules, doc.rules);
});

test('the empty sandbox policy lets any known product through on its own', () => {
  const doc = sandboxDocument();
  const draft = buildDraft(
    [
      { code: P.regular.code, quantity: 400, unit: 'l', salesUnits: 400, unitPrice: P.regular.price, total: 400 * P.regular.price, role: 'requested', name: P.regular.name, salesUnit: 'carton', deliveryDate: '2026-11-16' },
      { code: P.oat.code, quantity: 40, unit: 'l', salesUnits: 40, unitPrice: P.oat.price, total: 40 * P.oat.price, role: 'requested', name: P.oat.name, salesUnit: 'carton', deliveryDate: '2026-11-16' },
    ],
    '2026-11-16'
  );
  const { decision, checks } = evaluate(doc, draft, { weekSpend: 0, products });
  assert.equal(decision, 'execute', JSON.stringify(checks.filter((c) => !c.passed)));
});
