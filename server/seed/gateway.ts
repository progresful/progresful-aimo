import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import db from '../src/services/database.ts';
import { eventStore } from '../src/services/eventStore.ts';
import logger from '../src/services/logger.ts';
import __dirname from '../src/utils/dirname.ts';
import * as accountCommands from '../src/domains/auth/account/account.commands.ts';
import * as memberCommands from '../src/domains/auth/member/member.commands.ts';
import * as organizationCommands from '../src/domains/auth/organization/organization.commands.ts';
import * as userCommands from '../src/domains/auth/user/users.commands.ts';
import { createAgentCommand, createPolicyCommand } from '../src/domains/gateway/gateway.commands.ts';
import type { AutomationInput } from '../src/domains/gateway/gateway.automations.ts';
import { createAutomation } from '../src/domains/gateway/gateway.automations.ts';
import { createAgentKey } from '../src/domains/gateway/gateway.agents.ts';
import { decideApproval, expireApproval } from '../src/domains/gateway/gateway.approvals.ts';
import type { Caller } from '../src/domains/gateway/gateway.auth.ts';
import { DEMO_AGENT_ID, STOCKOUT_CAPS, demoDeliveryDate, scenarioRequest } from '../src/domains/gateway/gateway.demo.ts';
import { catalogSource, productByCode } from '../src/domains/gateway/gateway.products.ts';
import { calibrateCatalog } from '../src/domains/gateway/gateway.prices.ts';
import { valioMode } from '../src/domains/gateway/valio.client.ts';
import type { OrderRequest } from '../src/domains/gateway/gateway.orders.ts';
import { placeOrder } from '../src/domains/gateway/gateway.orders.ts';
import { createPolicy, signPolicy } from '../src/domains/gateway/gateway.policies.ts';
import type { Approver } from '../src/domains/gateway/policy.compiler.ts';
import { buildDocument, compilePlainLanguage } from '../src/domains/gateway/policy.compiler.ts';
import type { PolicyRule } from '../src/domains/gateway/policy.engine.ts';
import { addDays, helsinkiTime, localDay, steppedClock, weekStart } from '../src/domains/gateway/gateway.time.ts';

// Gateway demo data (idempotent: every block checks before it writes).
// Org + people → policies with version history → agents + API keys → this
// week's orders (run through the real orchestration with backdated clocks so
// the audit chain is genuine) → today's three demo scenarios.

const ORG_ID = '01KA0000000000000000000002';
const ANNA_ID = '01KA0000000000000000000001';
const MIKKO_ID = '01KA0000000000000000000003';
const DAIRY = 'pol_hospital-ward-dairy';
const KEYS_FILE = path.resolve(__dirname, '..', '..', '.agent-keys.local.json');

const ANNA = { name: 'Anna Virtanen', role: 'Purchasing manager' };
const MIKKO = { name: 'Mikko Laine', role: 'Head chef' };
const HEAD_CHEF: Approver = { name: MIKKO.name, role: MIKKO.role, windowMinutes: 30, fallback: 'order only what the policy allows' };

const DAIRY_TEXT =
  'Order dairy for the ward kitchen. Everything must be lactose-free. Auto-order up to €1,200 per order and €6,000 a week; anything above, or any substitute, goes to the head chef.';
const DAIRY_V1_TEXT = 'Order dairy for the ward kitchen. Everything must be lactose-free. Auto-order up to €800 per order; any substitute goes to the head chef.';
const DRY_TEXT =
  'Order dry goods (flour, oats, pasta, rice) for the ward kitchen. Anything for the coeliac menu shelf must be gluten-free. Auto-order up to €600 per order and €2,000 a week; anything above, or any product we have not ordered before, goes to the head chef.';
const EVENTS_TEXT =
  'Snacks and drinks for the Friday staff coffee. Up to €250 per order, one order a week, delivered on Friday. Pastries, coffee, juice and fruit only — never alcohol. Anything else goes to the ward manager.';

// --- Org and people ------------------------------------------------------------

const seedOrgAndPeople = async () => {
  const org = await db.organization.findUnique({ where: { id: ORG_ID } });
  if (!org) throw new Error(`Seeded org ${ORG_ID} not found — run the base seed first`);
  if (org.name !== 'HUS · Ward 4 kitchen' || org.slug !== 'hus-ward-4') {
    const { event } = await organizationCommands.updateOrganizationCommand(db, { id: ORG_ID, name: 'HUS · Ward 4 kitchen', slug: 'hus-ward-4' }, { authorId: ANNA_ID });
    await eventStore.log(event);
  }
  const anna = await db.user.findUnique({ where: { id: ANNA_ID } });
  if (anna && anna.name !== ANNA.name) {
    const { event } = await userCommands.updateUserCommand(db, { id: ANNA_ID, name: ANNA.name }, { authorId: ANNA_ID });
    await eventStore.log(event);
  }
  if (!(await db.user.findUnique({ where: { id: MIKKO_ID } }))) {
    const { event: u } = await userCommands.createUserCommand(db, { id: MIKKO_ID, email: 'mikko@example.com', name: MIKKO.name, role: 'user', emailVerified: true }, {});
    await eventStore.log(u);
    const { event: a } = await accountCommands.createAccountCommand(
      db,
      { id: ulid(), providerId: 'credential', accountId: MIKKO_ID, userId: MIKKO_ID, password: process.env.SEED_USER_PASSWORD },
      { authorId: MIKKO_ID }
    );
    await eventStore.log(a);
    const { event: m } = await memberCommands.createMemberCommand(db, { id: ulid(), organizationId: ORG_ID, userId: MIKKO_ID, role: 'member' }, { authorId: ANNA_ID });
    await eventStore.log(m);
  }
};

// --- Policies ------------------------------------------------------------------------

const compiled = async (text: string, approver: Approver) => (await compilePlainLanguage(text, approver)).rules;

/** One signed version of `key`, created a few minutes before it was signed. */
const signedVersion = async (p: { key: string; name: string; version: number; text: string; rules: PolicyRule[]; approver: Approver; signer: typeof ANNA; at: Date; summary: string; unit?: string }) => {
  const document = buildDocument({ key: p.key, name: p.name, version: p.version, plainLanguage: p.text, rules: p.rules, approver: p.approver, unit: p.unit });
  const createdAt = new Date(p.at.getTime() - 12 * 60_000);
  const { event } = await createPolicyCommand(
    db,
    { id: ulid(createdAt.getTime()), organizationId: ORG_ID, key: p.key, name: p.name, version: p.version, status: 'draft', plainLanguage: p.text, document: document as object, summary: p.summary, createdAt, updatedAt: createdAt },
    { authorId: ANNA_ID }
  );
  await eventStore.log(event);
  await signPolicy(db, ORG_ID, p.key, { name: p.signer.name, role: p.signer.role, at: p.at }, ANNA_ID);
};

const hasPolicy = async (key: string) => !!(await db.policy.findFirst({ where: { organizationId: ORG_ID, key } }));

export const DAIRY_V3_SIGNED_AT = helsinkiTime('2026-11-12', '08:14');

const seedPolicies = async () => {
  if (!(await hasPolicy(DAIRY))) {
    const v3 = await compiled(DAIRY_TEXT, HEAD_CHEF);
    // v2 = v3 without the fail-closed rule for missing allergen data.
    const v2 = v3.map((r) => (r.type === 'data.missing' ? { ...r, fields: ['nutrition.LACS'] } : r));
    const base = { key: DAIRY, name: 'Ward 4 kitchen — dairy', approver: HEAD_CHEF };
    await signedVersion({
      ...base,
      version: 1,
      text: DAIRY_V1_TEXT,
      rules: (await compiled(DAIRY_V1_TEXT, HEAD_CHEF)).map((r) => (r.type === 'data.missing' ? { ...r, fields: ['nutrition.LACS'] } : r)),
      signer: { name: 'Jukka Korhonen', role: 'Kitchen manager' },
      at: helsinkiTime('2026-10-02', '09:30'),
      summary: 'First version: dairy only, lactose-free, €800 per order, substitutes to the head chef',
    });
    await signedVersion({ ...base, version: 2, text: DAIRY_TEXT, rules: v2, signer: ANNA, at: helsinkiTime('2026-10-20', '13:02'), summary: 'Per-order limit €800 → €1,200 · added weekly cap €6,000' });
    // v3 is signed later, in time order with this week's orders (see seedOrders).
  }
  if (!(await hasPolicy('pol_staff-friday-events'))) {
    const approver: Approver = { name: 'Sari Nieminen', role: 'Ward manager', windowMinutes: 120, fallback: 'skip the order' };
    await signedVersion({
      key: 'pol_staff-friday-events',
      name: 'Friday staff events',
      version: 1,
      text: EVENTS_TEXT,
      rules: await compiled(EVENTS_TEXT, approver),
      approver,
      signer: ANNA,
      at: helsinkiTime('2026-10-28', '15:47'),
      summary: 'First version: €250 per order, Fridays only, no alcohol',
      unit: 'Ward 4 kitchen · staff room',
    });
  }
  if (!(await hasPolicy('pol_hospital-ward-dry'))) {
    await createPolicy(db, ORG_ID, { key: 'pol_hospital-ward-dry', name: 'Ward 4 kitchen — dry goods', plainLanguage: DRY_TEXT, at: helsinkiTime('2026-11-11', '16:20') }, ANNA_ID);
  }
};

const signDairyV3 = async () => {
  const latest = await db.policy.findFirst({ where: { organizationId: ORG_ID, key: DAIRY }, orderBy: { version: 'desc' } });
  if (!latest || latest.version >= 3) return;
  await signedVersion({
    key: DAIRY,
    name: 'Ward 4 kitchen — dairy',
    version: 3,
    text: DAIRY_TEXT,
    rules: await compiled(DAIRY_TEXT, HEAD_CHEF),
    approver: HEAD_CHEF,
    signer: ANNA,
    at: DAIRY_V3_SIGNED_AT,
    summary: 'Missing allergen data now fails closed — a person decides',
  });
};

// --- Agents and keys -------------------------------------------------------------------

const AGENTS = [
  { id: 'agt_gemini', name: 'Gemini buyer agent', vendor: 'Google', model: 'Gemini', host: 'Google Cloud · europe-north1', transport: 'mcp' },
  { id: 'agt_nemotron', name: 'Nemotron buyer agent', vendor: 'NVIDIA', model: 'Nemotron 3.5 Super VL (open weights)', host: 'Verda · Helsinki, Finland', transport: 'openapi' },
];

const seedAgents = async () => {
  const issued: Record<string, { agentId: string; keyId: string; key: string }> = {};
  for (const a of AGENTS) {
    if (!(await db.agent.findUnique({ where: { id: a.id } }))) {
      const { event } = await createAgentCommand(db, { ...a, organizationId: ORG_ID, policyId: DAIRY, apiKeyId: null, createdAt: helsinkiTime('2026-11-12', '08:30') }, { authorId: ANNA_ID });
      await eventStore.log(event);
    }
    const agent = await db.agent.findUnique({ where: { id: a.id } });
    if (!agent?.apiKeyId || !(await db.apikey.findUnique({ where: { id: agent.apiKeyId } }))) {
      const k = await createAgentKey(ORG_ID, a.id, { id: ANNA_ID });
      issued[a.id] = { agentId: a.id, keyId: k.keyId, key: k.key };
    }
  }
  if (Object.keys(issued).length) {
    const existing = fs.existsSync(KEYS_FILE) ? JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')) : {};
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ ...existing, ...issued }, null, 2) + '\n');
    console.log('\nAgent API keys (shown once; also written to server/.agent-keys.local.json):');
    for (const k of Object.values(issued)) console.log(`  ${k.agentId}: ${k.key}`);
    console.log('');
  }
};

// --- This week's orders ----------------------------------------------------------------
// Real Valio Aimo products (VALIO_PRODUCTS_FILE). History is backfilled
// through the simulator (past dates can't be quoted live), which prices each
// code at Valio's live price (see simPrice / REFERENCE_PRICES in valio.client.ts).
// Executed + approved before today ≈ €2,790 at the prices of 2026-11-14.
//
// What each row shows under the dairy policy (v2 until Thu 08:14, then v3):
// pass → executed; LACS > 0 → blocked; category outside dairy → blocked;
// no lactose / allergen data → a person decides (declined / approved).
//
// Without the real product file (fresh clone, sample catalog) only the rows
// and automations whose products the sample catalog has (464398, 463335,
// 463359 — real Valio codes) are seeded; the rest are skipped with a warning.

type HistoricOrder = {
  day: number; // 0 = Monday
  time: string;
  agent: 'agt_gemini' | 'agt_nemotron';
  note: string;
  lines: OrderRequest['lines'];
  deliverInDays?: number;
  decide?: { decision: 'approve' | 'decline'; afterMin: number; comment?: string };
};

// Totals at Valio's live prices of 2026-11-14 (per sales unit: ST = one pack, KI = case).
const HISTORY: HistoricOrder[] = [
  // Mon
  { day: 0, time: '07:40', agent: 'agt_gemini', note: 'Standing weekly milk', lines: [{ code: '464398', quantity: 400, unit: 'l' }] }, // Eila semi-skimmed 1 l: 400 × 1.65 = 660.00
  { day: 0, time: '09:15', agent: 'agt_nemotron', note: 'Cooking cream', lines: [{ code: '464249', quantity: 80, unit: 'l' }] }, // cooking cream 15 % LF 1 l: 80 × 2.63 = 210.40
  { day: 0, time: '11:02', agent: 'agt_gemini', note: 'Lactose-free yoghurt', lines: [{ code: '476824', quantity: 30, unit: 'kg' }] }, // A+ natural yoghurt LF 1 kg: 64.50
  { day: 0, time: '13:30', agent: 'agt_nemotron', note: 'Cheaper milk attempt', lines: [{ code: '463359', quantity: 120, unit: 'l' }] }, // semi-skimmed milk (KI 5 × 1 l): blocked, LACS 4.8
  { day: 0, time: '15:10', agent: 'agt_gemini', note: 'Edam slices', lines: [{ code: '462616', quantity: 10, unit: 'kg' }] }, // Edam 17 % e1 kg slices: 85.70
  // Tue
  { day: 1, time: '07:45', agent: 'agt_gemini', note: 'Milk 3 % for porridge', lines: [{ code: '463335', quantity: 120, unit: 'l' }] }, // Eila 3 % 1 l: 168.00
  {
    day: 1,
    time: '09:20',
    agent: 'agt_nemotron',
    note: 'Spread · no LACS data',
    lines: [{ code: '471715', quantity: 48, unit: 'pcs' }], // Flora lactose & dairy free 400 g: no lactose / allergen data
    decide: { decision: 'decline', afterMin: 11, comment: 'No lactose data — keep using butter' },
  }, // declined (98.40)
  { day: 1, time: '10:50', agent: 'agt_gemini', note: 'Whipping cream', lines: [{ code: '464194', quantity: 12, unit: 'l' }] }, // whipping cream LF 1 l: 46.92
  { day: 1, time: '14:05', agent: 'agt_nemotron', note: 'Oat drink', lines: [{ code: '468465', quantity: 40, unit: 'l' }] }, // Oddlygood oat drink 1 l: blocked — category plant.drinks is outside the dairy policy
  // Wed
  { day: 2, time: '07:40', agent: 'agt_gemini', note: 'Milk top-up', lines: [{ code: '464398', quantity: 300, unit: 'l' }] }, // 495.00
  { day: 2, time: '09:30', agent: 'agt_nemotron', note: 'Lactose-free quark', lines: [{ code: '477044', quantity: 30, unit: 'kg' }] }, // quark LF 5 kg: 6 × 16.03 = 96.18
  { day: 2, time: '11:15', agent: 'agt_gemini', note: 'Oltermanni slices', lines: [{ code: '462584', quantity: 10, unit: 'pcs' }] }, // Oltermanni e900 g slices: 110.10
  { day: 2, time: '13:40', agent: 'agt_nemotron', note: 'Cooking cream', lines: [{ code: '464249', quantity: 24, unit: 'l' }] }, // 63.12
  { day: 2, time: '15:20', agent: 'agt_gemini', note: 'Edam slices', lines: [{ code: '462616', quantity: 8, unit: 'kg' }] }, // 68.56
  // Thu (dairy v3 signed 08:14: missing allergen data now also goes to a person)
  { day: 3, time: '07:35', agent: 'agt_gemini', note: 'Milk 3 %', lines: [{ code: '463335', quantity: 240, unit: 'l' }] }, // 336.00
  { day: 3, time: '08:50', agent: 'agt_nemotron', note: 'Bulgarian yoghurt', lines: [{ code: '476578', quantity: 20, unit: 'kg' }] }, // Bulgarian yoghurt 200 g: blocked, LACS 3.9
  { day: 3, time: '10:05', agent: 'agt_gemini', note: 'Lactose-free yoghurt', lines: [{ code: '476824', quantity: 18, unit: 'kg' }] }, // 38.70
  {
    day: 3,
    time: '11:40',
    agent: 'agt_nemotron',
    note: 'Staff party Friday · Parmesan',
    lines: [{ code: '469671', quantity: 6, unit: 'kg' }], // Castelli Parmigiano Reggiano shavings 1 kg: no lactose / allergen data
    deliverInDays: 8,
    decide: { decision: 'approve', afterMin: 6, comment: 'Aged Parmigiano is naturally lactose-free — fine for the staff party' },
  }, // 164.04, approved
  { day: 3, time: '13:10', agent: 'agt_gemini', note: 'Whipping cream', lines: [{ code: '464194', quantity: 6, unit: 'l' }] }, // 23.46
  { day: 3, time: '14:30', agent: 'agt_nemotron', note: 'Cooking cream', lines: [{ code: '464249', quantity: 48, unit: 'l' }] }, // 126.24
  { day: 3, time: '15:30', agent: 'agt_gemini', note: 'Soft ice cream for dessert', lines: [{ code: '470832', quantity: 10, unit: 'l' }] }, // Pehmo soft ice cream mix (KI 10 × 1 l): blocked — LACS 0.01 > 0
  { day: 3, time: '16:20', agent: 'agt_nemotron', note: 'Lactose-free yoghurt', lines: [{ code: '476824', quantity: 16, unit: 'kg' }] }, // 34.40
];

const realCatalog = () => catalogSource() === 'valio-file';

/**
 * Items whose product codes the loaded catalog knows. With the real catalog an
 * unknown code fails loudly (seed and VALIO_PRODUCTS_FILE disagree); with the
 * sample catalog those items are skipped.
 */
const knownOnly = <T extends { lines: { code: string }[] }>(items: T[], what: string): T[] => {
  const unknown = [...new Set(items.flatMap((i) => i.lines.map((l) => l.code)))].filter((c) => !productByCode(c));
  if (!unknown.length) return items;
  if (realCatalog()) throw new Error(`Gateway seed: product codes not in the Valio product file: ${unknown.join(', ')} — check VALIO_PRODUCTS_FILE`);
  const kept = items.filter((i) => i.lines.every((l) => productByCode(l.code)));
  logger.warn(`Gateway seed: sample catalog (no VALIO_PRODUCTS_FILE) — seeding ${kept.length} of ${items.length} ${what}; skipped codes: ${unknown.join(', ')}`);
  return kept;
};

const callerFor = async (agentId: string): Promise<Caller> => {
  const agent = (await db.agent.findUnique({ where: { id: agentId } }))!;
  return { organizationId: ORG_ID, via: 'api-key', agent, user: null, authorId: agent.id };
};

/** Days of this week before today; if today is Monday, history happens earlier today. */
const historyDays = (today: string) => {
  const days: string[] = [];
  for (let d = weekStart(today); d < today; d = addDays(d, 1)) days.push(d);
  return days.length ? days : [today];
};

const runHistoric = async (h: HistoricOrder, start: Date) => {
  const clock = steppedClock(start, 1800);
  const caller = await callerFor(h.agent);
  const day = localDay(start);
  const requestedDate = addDays(day, h.deliverInDays ?? 1);
  const result = await placeOrder(caller, caller.agent!, { lines: h.lines, requestedDate, note: h.note, idempotencyKey: `seed-${day}-${h.time}-${h.agent}` }, { clock, valioMode: 'simulator' });
  if (h.decide && result.approval) {
    clock.jump(h.decide.afterMin * 60_000);
    return (await decideApproval(ORG_ID, result.approval.id, h.decide.decision, { ...MIKKO, comment: h.decide.comment }, MIKKO_ID, clock)).order;
  }
  return result.order;
};

const seedOrders = async () => {
  if (await db.order.count({ where: { organizationId: ORG_ID } })) {
    logger.info('Gateway orders already seeded. Skipping.');
    return;
  }
  const now = new Date();
  const today = localDay(now);
  const days = historyDays(today);
  const history = knownOnly(HISTORY, 'history orders');
  const runs = history.map((h, i) => ({ h, at: days.length === 1 && days[0] === today ? new Date(now.getTime() - (history.length + 4 - i) * 4 * 60_000) : helsinkiTime(days[Math.min(h.day, days.length - 1)], h.time) }));
  runs.sort((a, b) => a.at.getTime() - b.at.getTime());

  let v3Signed = false;
  for (const { h, at } of runs) {
    if (!v3Signed && at >= DAIRY_V3_SIGNED_AT) {
      await signDairyV3();
      v3Signed = true;
    }
    const order = await runHistoric(h, at);
    logger.info(`Gateway seed: ${order.id} ${order.status} ${order.committedTotal}`);
  }
  if (!v3Signed) await signDairyV3();

  // Today: the three demo scenarios, through the same path as POST /api/gw/demo/run.
  const caller = await callerFor(DEMO_AGENT_ID);
  const date = demoDeliveryDate(now);
  // Valio's mock API never runs out, so (as in runScenario) the stock-out stories cap 464398 themselves.
  const demo = (scenario: 'routine' | 'stockout' | 'timeout', at: Date) =>
    placeOrder(caller, caller.agent!, scenarioRequest(scenario, date), {
      clock: steppedClock(at, 1500),
      demoReplay: true,
      stockCaps: scenario !== 'routine' && valioMode() === 'live' ? STOCKOUT_CAPS : undefined,
    });

  await demo('routine', new Date(now.getTime() - 55 * 60_000));
  const stockout = await demo('stockout', new Date(now.getTime() - 50 * 60_000));
  if (!stockout.approval) throw new Error(`Gateway seed: the stock-out scenario should need approval, got ${stockout.order.status}`);
  await decideApproval(ORG_ID, stockout.approval.id, 'approve', { ...MIKKO, comment: 'Fine for one delivery' }, MIKKO_ID, steppedClock(new Date(now.getTime() - 43 * 60_000), 1500));
  const timeoutStart = new Date(now.getTime() - 41 * 60_000);
  const timeout = await demo('timeout', timeoutStart);
  if (!timeout.approval) throw new Error(`Gateway seed: the timeout scenario should need approval, got ${timeout.order.status}`);
  await expireApproval(ORG_ID, timeout.approval.id, steppedClock(new Date(timeout.approval.expiresAt), 1500));
};

// --- Automations (standing orders) ------------------------------------------------
// Real orders once enabled: the sweeper places them on schedule. Every line is
// lactose-free (LACS 0) and inside the dairy policy's categories: 464398 Eila
// semi-skimmed 1 l, 463335 Eila 3 % 1 l, and for the Friday events 464194
// whipping cream 1 l + 462616 Edam e1 kg slices.

const AUTOMATIONS: (AutomationInput & { id: string })[] = [
  {
    id: 'aut_standing-weekly-milk',
    name: 'Standing weekly milk',
    description: 'Lactose-free semi-skimmed milk for the ward, twice a week.',
    schedule: { days: [1, 4], time: '06:00', leadDays: 1 },
    lines: [{ code: '464398', quantity: 400, unit: 'l' }],
    agentId: 'agt_gemini',
    enabled: true,
  },
  {
    id: 'aut_yoghurt-quark-top-up', // id kept from an earlier version of the demo
    name: 'Mid-week 3 % milk top-up',
    description: 'Wednesday top-up of lactose-free 3 % milk for porridge and baking.',
    schedule: { days: [3], time: '06:30', leadDays: 1 },
    lines: [{ code: '463335', quantity: 120, unit: 'l' }],
    agentId: 'agt_nemotron',
    enabled: true,
  },
  {
    id: 'aut_friday-staff-events',
    name: 'Friday staff events — cream & cheese',
    description: 'Whipping cream and cheese slices for the Friday staff coffee. Paused until the events calendar is confirmed.',
    schedule: { days: [4], time: '10:00', leadDays: 1 },
    lines: [
      { code: '464194', quantity: 12, unit: 'l' },
      { code: '462616', quantity: 4, unit: 'kg' },
    ],
    agentId: 'agt_gemini',
    enabled: false,
  },
];

const seedAutomations = async () => {
  for (const { id, ...input } of knownOnly(AUTOMATIONS, 'automations')) {
    if (await db.automation.findUnique({ where: { id } })) continue;
    await createAutomation(ORG_ID, input, ANNA_ID, { id, at: helsinkiTime('2026-11-12', '09:00') });
    logger.info(`Gateway seed: automation ${id}`);
  }
};

export async function seedGateway() {
  while (!eventStore.isReady) await new Promise((res) => setTimeout(res, 200));
  logger.info(`Gateway seed: catalog ${catalogSource()}`);
  await calibrateCatalog(); // live mode: litres / kg per sales unit checked against Valio's prices
  await seedOrgAndPeople();
  await seedPolicies();
  await seedAgents();
  await seedOrders();
  await signDairyV3(); // no-op once v3 exists
  await seedAutomations();
  logger.info('Gateway seed completed.');
}
