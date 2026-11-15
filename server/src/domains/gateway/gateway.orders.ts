import { ulid } from 'ulid';
import type { Agent, Approval, Order, Policy } from '../../../prisma/generated/prisma/index';
import prisma from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import { AppError } from '../../utils/AppError.ts';
import { chainHead, appendAudit, auditView } from './audit.service.ts';
import type { Actor, Step, StepStatus } from './audit.service.ts';
import { shortHash } from './audit.chain.ts';
import type { Caller } from './gateway.auth.ts';
import { createApprovalCommand, createOrderCommand, updateOrderCommand } from './gateway.commands.ts';
import { eur, num, sum } from './gateway.money.ts';
import { activePolicy } from './gateway.policies.ts';
import type { Product } from './gateway.products.ts';
import { productByCode, substitutePool } from './gateway.products.ts';
import { issueQuote, quoteView } from './gateway.quotes.ts';
import { type ValioMode, valioMode } from './valio.client.ts';
import type { SignedQuote } from './gateway.quotes.ts';
import { shortSignature } from './gateway.signing.ts';
import type { Clock } from './gateway.time.ts';
import { fmtDay, isDay, localDay, sameWeek, systemClock, weekdayName } from './gateway.time.ts';
import type { OrderLine } from './gateway.views.ts';
import { approvalView, orderView, ordered } from './gateway.views.ts';
import { approverOf } from './policy.compiler.ts';
import { joinAnd, productLabel, scopeText } from './policy.describe.ts';
import type { Candidate, Check, DraftLine, PolicyDocument, RequestUnit, RuleProduct } from './policy.engine.ts';
import {
  UnitMismatchError,
  buildDraft,
  checkProduct,
  draftLine,
  evaluate,
  failingReasons,
  inScope,
  pickSubstitutes,
  policyAllowedPart,
  rankSubstitutes,
  rulesOfType,
  toBase,
  toSalesUnits,
} from './policy.engine.ts';

// Order orchestration: every step is appended to the audit chain with the step
// ids the playbook graph uses (request → lookup → stock → substitutes →
// lactose → policy → approval → order → audit).

export type OrderRequest = {
  lines: { code: string; quantity: number; unit: RequestUnit }[];
  requestedDate: string;
  allowSubstitutes?: boolean;
  note?: string;
  idempotencyKey?: string;
};

export type RunContext = {
  clock?: Clock;
  ignoredFields?: string[];
  /**
   * Demo replays are flagged on the order and don't count toward each other's weekly spend,
   * so every run of a scenario starts from the same state on any day of the demo.
   */
  demoReplay?: boolean;
  /** Demo stock-out: caps a product's stock on the quote (Valio's mock API never runs out). */
  stockCaps?: Record<string, number>;
  /** Set when an automation (standing order) places this order — on the schedule or via "run now". */
  automation?: { id: string; name: string; trigger: 'schedule' | 'manual'; slot?: string };
  /** Force the Valio source for this order's quote (seed backfill: simulator). */
  valioMode?: ValioMode;
  /** Dry run: real quote and real policy checks, but no order, approval or audit entry is written. */
  dryRun?: boolean;
  /** Dry run only: evaluate against this policy version (e.g. an unsigned draft) instead of the agent's signed one. */
  policyId?: string;
};

const triggerNote = (a: NonNullable<RunContext['automation']>) =>
  a.trigger === 'schedule' ? ` · triggered by the schedule of automation “${a.name}”` : ` · run now from automation “${a.name}”`;

const FIRST_ORDER_NUMBER = 20458;
let lastOrderNumber = 0;
let idQueue: Promise<unknown> = Promise.resolve();

/** VA-20458, VA-20459, … — allocated in-process so concurrent orders never collide. */
const allocateOrderId = () => {
  const run = idQueue.then(async () => {
    const rows = await prisma.order.findMany({ where: { id: { startsWith: 'VA-' } }, select: { id: true } });
    // Audit entries outlive deleted (sandbox-reset) orders, so their ids are never reused either.
    const logged = await prisma.auditEntry.findMany({ where: { orderId: { startsWith: 'VA-' } }, distinct: ['orderId'], select: { orderId: true } });
    const dbMax = Math.max(FIRST_ORDER_NUMBER - 1, ...rows.map((r) => Number(r.id.slice(3)) || 0), ...logged.map((r) => Number(r.orderId!.slice(3)) || 0));
    lastOrderNumber = Math.max(dbMax, lastOrderNumber) + 1;
    return `VA-${lastOrderNumber}`;
  });
  idQueue = run.catch(() => undefined);
  return run;
};

const isDemoReplay = (request: unknown) => (request as { demo?: boolean } | null)?.demo === true;

/** Money committed this ISO week (Helsinki) under a policy, up to `at`. `excludeDemo` leaves out demo replays. */
export const weekSpend = async (organizationId: string, policyKey: string, at: Date, excludeDemo = false) => {
  const since = new Date(at.getTime() - 8 * 24 * 3600 * 1000);
  const orders = await prisma.order.findMany({
    where: { organizationId, policyKey, createdAt: { gte: since, lte: at } },
    select: { createdAt: true, committedTotal: true, request: true },
  });
  return sum(orders.filter((o) => sameWeek(o.createdAt, at) && !(excludeDemo && isDemoReplay(o.request))).map((o) => o.committedTotal));
};

/** Appends audit entries for one order run and remembers them for the response. */
export const auditTrail = (organizationId: string, orderId: string, authorId: string, clock: Clock) => {
  const entries: Awaited<ReturnType<typeof appendAudit>>[] = [];
  const log = async (step: Step, status: StepStatus, actor: Actor, message: string, payload: Record<string, unknown> = {}) => {
    entries.push(await appendAudit({ organizationId, orderId, step, status, actor, message, payload, at: clock() }, authorId));
  };
  /** Final `audit` step: how many entries this order has, and the chain head before this one. */
  const close = async () => {
    const count = (await prisma.auditEntry.count({ where: { organizationId, orderId } })) + 1;
    const head = await chainHead();
    await log('audit', 'auto', 'gateway', `${count} entries appended · chain head ${shortHash(head)}`, { entries: count, head });
  };
  return { entries, log, close };
};

/** Same interface as auditTrail, but keeps entries in memory: a preview writes nothing to the log. */
const previewTrail = (organizationId: string, clock: Clock) => {
  const entries: Awaited<ReturnType<typeof appendAudit>>[] = [];
  const log = async (step: Step, status: StepStatus, actor: Actor, message: string, payload: Record<string, unknown> = {}) => {
    const seq = entries.length + 1;
    entries.push({ seq, id: `preview-${seq}`, organizationId, orderId: null, step, status, actor, message, payload, prevHash: '', hash: '', createdAt: clock() } as unknown as (typeof entries)[number]);
  };
  const close = async () => log('audit', 'skipped', 'gateway', 'Preview only — nothing ordered, nothing recorded');
  return { entries, log, close };
};

const policyVersion = async (organizationId: string, id: string) => {
  const p = await prisma.policy.findFirst({ where: { organizationId, id } });
  if (!p) throw new AppError('Policy version not found', 404, { id });
  return p;
};

/** A product as people read it in audit messages (name, else code). */
const nameOf = (code: string) => productLabel(productByCode(code) ?? undefined, code);

const describeLines = (lines: { code: string; quantity: number; unit: string }[]) => lines.map((l) => `${num(l.quantity)} ${l.unit} of ${nameOf(l.code)}`).join(' + ');

const ruleProducts = (codes: Iterable<string>) => {
  const map = new Map<string, RuleProduct>();
  for (const code of codes) {
    const p = productByCode(code);
    if (p) map.set(code, p);
  }
  return map;
};

const placedMessage = (orderId: string, lines: OrderLine[], total: number, suffix = '') =>
  `Order ${orderId} placed · ${lines.length > 1 ? `${lines.length} lines` : describeLines(lines)} · ${eur(total)}${suffix}`;

// --- Steps ---------------------------------------------------------------------

type Resolved = { request: OrderRequest['lines'][number]; product: Product; salesUnits: number };

const resolveLines = (req: OrderRequest) => {
  const resolved: Resolved[] = [];
  const unknownCodes: string[] = [];
  for (const line of req.lines) {
    const product = productByCode(line.code);
    if (!product) {
      unknownCodes.push(line.code);
      continue;
    }
    try {
      resolved.push({ request: line, product, salesUnits: toSalesUnits(line.quantity, line.unit, product) });
    } catch (err) {
      if (err instanceof UnitMismatchError) throw new AppError(err.message, 422, { code: line.code, unit: line.unit });
      throw err;
    }
  }
  return { resolved, unknownCodes };
};

type StockResult = { line: Resolved; take: number; shortBase: number; available: number };

const stockStep = (resolved: Resolved[], quote: SignedQuote) =>
  resolved.map((r): StockResult => {
    const q = quote.lines.find((l) => l.code === r.product.code);
    const available = q?.availableByRequestedDate ?? 0;
    const take = Math.min(r.salesUnits, available);
    return { line: r, take, available, shortBase: toBase(r.salesUnits - take, r.product) };
  });

const UNLIMITED = 1e8;

/** The earliest date by which every requested product has a Valio delivery, if later than `date`. */
const earliestDateFor = (codes: string[], quote: SignedQuote, date: string) => {
  const dates = codes.map((code) => quote.lines.find((l) => l.code === code)?.earliestDelivery ?? null);
  if (!dates.length || dates.some((d) => d === null)) return null;
  const latest = (dates as string[]).sort().pop()!;
  return latest > date ? latest : null;
};

const stockMessage = (stock: StockResult[], requestedDate: string) =>
  stock
    .map((s) => {
      const base = s.line.product.salesUnit.base;
      // Valio reports "no limit" as a huge sentinel amount (9,999,999,999).
      const avail = s.available >= UNLIMITED ? `in stock for ${weekdayName(requestedDate)}` : `${num(toBase(s.available, s.line.product))} ${base} available for ${weekdayName(requestedDate)}`;
      return `${productLabel(s.line.product)}: ${avail} — ${s.shortBase > 0 ? `short by ${num(s.shortBase)} ${base}` : 'fully covered'}`;
    })
    .join(' · ');

const candidateInputs = (pool: Product[], quote: SignedQuote) =>
  pool.map((p) => {
    const q = quote.lines.find((l) => l.code === p.code);
    return {
      product: p,
      unitPrice: q?.unitPrice ?? p.price,
      availableUnits: q?.availableByRequestedDate ?? 0,
      earliestDelivery: q?.earliestDelivery ?? null,
      cutoffPassed: q?.cutoffPassed ? q.closingTime : null,
    };
  });

const lactoseMessage = (doc: PolicyDocument, requested: Product[], candidates: Candidate[]) => {
  const rules = rulesOfType(doc, 'nutrition');
  const label = (p: { lacs: number | null }) => `LACS ${num(p.lacs ?? 0)}`;
  const parts: string[] = [];
  // "<name> blocked (LACS 4.8 g/100 g)" — the builder page picks this clause out of the message.
  for (const p of requested) {
    if (!rules.some((r) => inScope(r.scope, p))) {
      parts.push(`${productLabel(p)}: the lactose rule doesn't apply (${scopeText(rules.find((r) => r.scope)?.scope)} only)`);
      continue;
    }
    const v = checkProduct({ ...doc, rules }, p);
    parts.push(
      v.hard.length ? `${productLabel(p)} blocked (${label(p)} g/100 g)` : v.missing.length ? `Valio has no lactose info for ${productLabel(p)} — a person decides` : `${productLabel(p)} passes (${label(p)})`
    );
  }
  for (const c of candidates) {
    if (c.verdict === 'blocked') parts.push(c.lacs === null ? `${productLabel(c)} blocked` : `${productLabel(c)} blocked (${label(c)} g/100 g)`);
    else if (c.verdict === 'missing_data') parts.push(`Valio has no lactose info for ${productLabel(c)} — not picked automatically`);
    else if (c.verdict === 'picked') parts.push(`${productLabel(c)} passes (${label(c)})`);
  }
  return parts.join(' · ');
};

const policyMessage = (decision: string, checks: Check[], doc: PolicyDocument, total: number) => {
  if (decision === 'execute') {
    const limits = checks.filter((c) => c.rule === 'limit.perOrder' || c.rule === 'limit.perWeek').map((c) => `${eur(Number(c.limit), 0)} per ${c.rule === 'limit.perOrder' ? 'order' : 'week'}`);
    return limits.length ? `${eur(total)} within ${limits.join(' and ')}` : `${eur(total)} — every rule passes`;
  }
  const failing = checks.filter((c) => !c.passed && c.severity === (decision === 'block' ? 'hard' : 'approval'));
  const phrases = failing.map((c) => (c.rule === 'substitution.requiresApproval' ? 'includes a substitute' : c.detail));
  return (decision === 'block' ? 'Blocked: ' : '') + phrases.join(', and ');
};

// --- Orchestration ---------------------------------------------------------------

export const findByIdempotencyKey = (organizationId: string, idempotencyKey?: string) =>
  idempotencyKey ? prisma.order.findFirst({ where: { organizationId, idempotencyKey } }) : null;

const runOrder = async (caller: Caller, agent: Agent, req: OrderRequest, ctx: RunContext = {}) => {
  const clock = ctx.clock ?? systemClock;
  if (!isDay(req.requestedDate)) throw new AppError('requestedDate must be YYYY-MM-DD', 400);
  if (req.requestedDate < localDay(clock())) throw new AppError('requestedDate is in the past', 422, { requestedDate: req.requestedDate, today: localDay(clock()) });

  const existing = ctx.dryRun ? null : await findByIdempotencyKey(caller.organizationId, req.idempotencyKey);
  if (existing) return { ...(await orderDetails(caller.organizationId, existing.id)), idempotentReplay: true };

  // The policy comes from the agent's binding, never from the request.
  const policy = ctx.dryRun && ctx.policyId ? await policyVersion(caller.organizationId, ctx.policyId) : await activePolicy(caller.organizationId, agent.policyId);
  const doc = policy.document as unknown as PolicyDocument;
  const { resolved, unknownCodes } = resolveLines(req);

  const orderId = ctx.dryRun ? 'preview' : await allocateOrderId();
  const trail = ctx.dryRun ? previewTrail(caller.organizationId, clock) : auditTrail(caller.organizationId, orderId, caller.authorId, clock);
  const date = req.requestedDate;

  await trail.log('request', 'auto', 'buyer-agent', `${describeLines(req.lines)} for ${fmtDay(date)} · policy ${policy.key} v${policy.version}${ctx.automation ? triggerNote(ctx.automation) : ''}`, {
    agent: { id: agent.id, name: agent.name, via: caller.via },
    ...(ctx.automation ? { trigger: ctx.automation.trigger, automationId: ctx.automation.id, ...(ctx.automation.slot ? { slot: ctx.automation.slot } : {}) } : {}),
    request: req,
    policy: { id: policy.id, key: policy.key, version: policy.version, signature: shortSignature(policy.signature) },
    ...(ctx.ignoredFields?.length ? { ignoredFields: ctx.ignoredFields, note: 'Fields outside the order schema are ignored; limits come from the signed policy' } : {}),
  });

  // lookup: one signed quote for the requested products and every substitute candidate
  const allowSubs = req.allowSubstitutes !== false;
  const pools = new Map(resolved.map((r) => [r.product.code, allowSubs ? substitutePool(r.product) : []]));
  const quoteItems = [
    ...resolved.map((r) => ({ code: r.product.code, salesUnits: r.salesUnits })),
    ...[...pools.values()].flat().map((p) => ({ code: p.code })),
    ...unknownCodes.map((code) => ({ code })),
  ].filter((item, i, all) => all.findIndex((x) => x.code === item.code) === i);
  const { quote } = await issueQuote({
    organizationId: caller.organizationId,
    requestedDate: date,
    items: quoteItems,
    policy,
    agentId: agent.id,
    at: clock(),
    authorId: caller.authorId,
    stockCaps: ctx.stockCaps,
    valioMode: ctx.valioMode,
    estimateIfDown: ctx.dryRun,
  });
  await trail.log('lookup', 'auto', 'valio-api', `Signed quote ${quote.id} · ${quote.lines.length} products · valid 15 min${quote.source === 'simulator' ? (!ctx.valioMode && valioMode() === 'live' ? ' · estimate — Valio isn’t answering' : ' · simulator') : ''}`, {
    quoteId: quote.id,
    source: quote.source,
    total: quote.total,
    expiresAt: quote.expiresAt,
    signature: shortSignature(quote.signature),
    ...(unknownCodes.length ? { unknownCodes } : {}),
  });

  // stock
  const stock = stockStep(resolved, quote);
  const lines: DraftLine[] = stock
    .filter((s) => s.take > 0)
    .map((s) => draftLine(s.line.product, s.take, quote.lines.find((l) => l.code === s.line.product.code)!.unitPrice, date, 'requested'));
  const capped = quote.lines.filter((l) => l.simulatedCap !== null).map((l) => l.code);
  const stockNote = capped.length ? ` (simulated supply disruption on ${capped.join(', ')} — Valio's mock API never runs out)` : '';
  await trail.log('stock', 'auto', 'gateway', stock.length ? stockMessage(stock, date) + stockNote : 'No known products to check', {
    ...(capped.length ? { simulatedDisruption: capped } : {}),
    lines: stock.map((s) => ({ code: s.line.product.code, requestedUnits: s.line.salesUnits, availableUnits: s.available, short: s.shortBase, unit: s.line.product.salesUnit.base })),
  });

  // substitutes
  const short = stock.filter((s) => s.shortBase > 0);
  const shortfalls: { code: string; quantity: number; unit: string }[] = [];
  const candidates: (Candidate & { for: string })[] = [];
  const products = ruleProducts([...resolved.map((r) => r.product.code), ...[...pools.values()].flat().map((p) => p.code)]);
  for (const s of short) {
    const pool = pools.get(s.line.product.code) ?? [];
    const ranked = rankSubstitutes(doc, s.line.product, candidateInputs(pool, quote), date);
    const { picks, remaining } = pickSubstitutes(ranked, s.shortBase, products);
    for (const pick of picks) lines.push(draftLine(products.get(pick.candidate.code)!, pick.salesUnits, pick.candidate.unitPrice, date, 'substitute', s.line.product.code));
    if (remaining > 0) shortfalls.push({ code: s.line.product.code, quantity: remaining, unit: s.line.product.salesUnit.base });
    candidates.push(...ranked.map((c) => ({ ...c, for: s.line.product.code })));
  }
  if (short.length && allowSubs) {
    const first = candidates.find((c) => c.verdict === 'picked');
    await trail.log(
      'substitutes',
      'auto',
      'gateway',
      `${candidates.length} candidates ranked · ` +
        (first
          ? `${productLabel(first)} first (${first.valioSubstitute ? 'Valio substitute, ' : ''}delivery reliability ${first.reliability === null ? 'unknown' : `${Math.round(first.reliability * 100)} %`})`
          : 'none meets the rules and the delivery date'),
      { candidates }
    );
  } else {
    await trail.log('substitutes', 'skipped', 'gateway', short.length ? 'Substitutes not allowed by the request' : 'Not needed — every line covered');
  }
  if (!allowSubs) shortfalls.push(...short.map((s) => ({ code: s.line.product.code, quantity: s.shortBase, unit: s.line.product.salesUnit.base })));

  // lactose (the hard nutrition rules, plus fail-closed missing data)
  const requestedProducts = resolved.map((r) => r.product);
  const requestedIssues = requestedProducts.filter((p) => {
    const v = checkProduct({ ...doc, rules: rulesOfType(doc, 'nutrition').concat(rulesOfType(doc, 'data.missing')) }, p);
    return v.hard.length || v.missing.length;
  });
  if (rulesOfType(doc, 'nutrition').length === 0) {
    await trail.log('lactose', 'skipped', 'policy', 'Policy has no nutrition rule');
  } else if (candidates.length || requestedIssues.length) {
    const blocked = requestedProducts.some((p) => checkProduct({ ...doc, rules: rulesOfType(doc, 'nutrition') }, p).hard.length);
    await trail.log('lactose', blocked ? 'blocked' : 'auto', 'policy', lactoseMessage(doc, requestedProducts, candidates), {
      rules: rulesOfType(doc, 'nutrition'),
      checked: [...requestedProducts.map((p) => ({ code: p.code, lacs: p.lacs, role: 'requested' })), ...candidates.map((c) => ({ code: c.code, lacs: c.lacs, verdict: c.verdict }))],
    });
  } else if (requestedProducts.length && requestedProducts.every((p) => !rulesOfType(doc, 'nutrition').some((r) => inScope(r.scope, p)))) {
    const covers = [...new Set(rulesOfType(doc, 'nutrition').map((r) => scopeText(r.scope)).filter(Boolean))];
    await trail.log('lactose', 'skipped', 'policy', `Doesn't apply — the nutrition rules cover ${joinAnd(covers)} only, and this order has none`);
  } else {
    await trail.log('lactose', 'skipped', 'policy', `Not needed — ${joinAnd(requestedProducts.map((p) => productLabel(p)))} pass${requestedProducts.length === 1 ? 'es' : ''} the nutrition rules`);
  }

  // policy
  const draft = buildDraft(lines, date, shortfalls, unknownCodes);
  const spent = await weekSpend(caller.organizationId, policy.key, clock(), ctx.demoReplay);
  // When nothing can arrive in time, tell the agent the earliest date that works instead of a dead end.
  const suggestedDate = lines.length ? null : earliestDateFor(resolved.map((r) => r.product.code), quote, date);
  const { decision, checks } = evaluate(doc, draft, { weekSpend: spent, products, suggestedDate });
  await trail.log('policy', decision === 'execute' ? 'auto' : decision === 'block' ? 'blocked' : 'pending', 'policy', policyMessage(decision, checks, doc, draft.total), {
    decision,
    weekSpend: spent,
    ...(ctx.demoReplay ? { weekSpendBasis: 'spend excluding demo replays' } : {}),
    total: draft.total,
    checks,
  });

  const status = decision === 'execute' ? 'executed' : decision === 'block' ? 'blocked' : 'pending_approval';
  const lineStatus = decision === 'execute' ? 'ordered' : decision === 'block' ? 'blocked' : 'proposed';
  const orderLines: OrderLine[] = [
    ...lines.map((l) => ({ ...l, status: lineStatus as OrderLine['status'] })),
    ...shortfalls.map((s) => openLine(s.code, s.quantity, 'Not available by the requested date')),
  ];
  if (ctx.dryRun) return previewResult({ trail, decision, checks, quote, candidates, orderLines, doc, total: draft.total, suggestedDate });

  const createdAt = clock();
  const { response: order, event } = await createOrderCommand(
    prisma,
    {
      id: orderId,
      organizationId: caller.organizationId,
      policyId: policy.id,
      policyKey: policy.key,
      policyVersion: policy.version,
      agentId: agent.id,
      quoteId: quote.id,
      status,
      title: req.note ?? `${describeLines(req.lines)} for ${fmtDay(date)}`,
      request: {
        ...req,
        agentId: agent.id,
        via: caller.via,
        ...(ctx.demoReplay ? { demo: true } : {}),
        ...(ctx.automation ? { automationId: ctx.automation.id, trigger: ctx.automation.trigger } : {}),
      } as object,
      lines: orderLines as object,
      total: draft.total,
      committedTotal: decision === 'execute' ? draft.total : 0,
      deliveryDate: date,
      checks: checks as object,
      candidates: candidates as object,
      idempotencyKey: req.idempotencyKey ?? null,
      createdAt,
      updatedAt: createdAt,
    },
    { authorId: caller.authorId }
  );
  await eventStore.log(event!);

  // approval
  let approval: Approval | null = null;
  if (decision === 'needs_approval') {
    const approver = approverOf(doc);
    const fallback = policyAllowedPart(doc, draft, { weekSpend: spent, products });
    const at = clock();
    const created = await createApprovalCommand(
      prisma,
      {
        id: `apr_${ulid(at.getTime())}`,
        orderId,
        organizationId: caller.organizationId,
        approverName: approver.name,
        approverRole: approver.role,
        status: 'pending',
        reasons: failingReasons(checks) as object,
        fallback: fallback as object,
        expiresAt: new Date(at.getTime() + approver.windowMinutes * 60_000),
        createdAt: at,
      },
      { authorId: caller.authorId }
    );
    await eventStore.log(created.event!);
    approval = created.response;
    await trail.log('approval', 'pending', 'gateway', `Approval requested from ${approver.name} (${approver.role.toLowerCase()}) · expires in ${approver.windowMinutes} min`, {
      approvalId: approval.id,
      approver: { name: approver.name, role: approver.role },
      reasons: approval.reasons,
      expiresAt: approval.expiresAt.toISOString(),
      fallback: { lines: fallback.map((l) => ({ code: l.code, quantity: l.quantity, unit: l.unit, total: l.total })), total: sum(fallback.map((l) => l.total)) },
    });
  } else {
    await trail.log('approval', 'skipped', 'gateway', decision === 'block' ? 'Not applicable — a hard rule blocks the order' : 'Not needed');
  }

  // order
  if (decision === 'execute') {
    await trail.log('order', 'auto', 'gateway', placedMessage(orderId, ordered(orderLines), draft.total), { orderId, quoteId: quote.id, total: draft.total, lines: lines.length });
  } else if (decision === 'block') {
    await trail.log('order', 'blocked', 'gateway', `Order ${orderId} not placed — ${failingReasons(checks).filter((r) => r.severity === 'hard').map((r) => r.detail).join('; ')}`, { orderId });
  }
  await trail.close();

  return {
    decision,
    order: orderView(order, agent, approval),
    checks,
    quote,
    approval: approval ? approvalView(approval, order) : null,
    audit: trail.entries.map(auditView),
  };
};

type PreviewInput = {
  trail: ReturnType<typeof previewTrail> | ReturnType<typeof auditTrail>;
  decision: ReturnType<typeof evaluate>['decision'];
  checks: ReturnType<typeof evaluate>['checks'];
  quote: SignedQuote;
  candidates: (Candidate & { for: string })[];
  orderLines: OrderLine[];
  doc: PolicyDocument;
  total: number;
  suggestedDate: string | null;
};

/** What would happen if this order were placed now — the remaining steps logged as predictions. */
const previewResult = async ({ trail, decision, checks, quote, candidates, orderLines, doc, total, suggestedDate }: PreviewInput) => {
  if (decision === 'needs_approval') {
    const approver = approverOf(doc);
    await trail.log('approval', 'pending', 'gateway', `Would ask ${approver.name} (${approver.role.toLowerCase()}) to approve · ${approver.windowMinutes} min to decide`, {
      approver: { name: approver.name, role: approver.role },
      reasons: failingReasons(checks),
    });
  } else {
    await trail.log('approval', 'skipped', 'gateway', decision === 'block' ? 'Not applicable — a hard rule blocks the order' : 'Not needed');
  }
  if (decision === 'execute') await trail.log('order', 'auto', 'gateway', `Would be placed · ${eur(total)} at the quoted prices`, { total });
  else if (decision === 'block') await trail.log('order', 'blocked', 'gateway', `Would not be placed — ${failingReasons(checks).filter((r) => r.severity === 'hard').map((r) => r.detail).join('; ')}`);
  else await trail.log('order', 'skipped', 'gateway', 'Placed once approved');
  await trail.close();
  return {
    preview: true as const,
    decision,
    checks,
    quote,
    candidates,
    lines: orderLines.filter((l) => l.status !== 'open'),
    open: orderLines.filter((l) => l.status === 'open').map((l) => ({ code: l.code, name: l.name, quantity: l.quantity, unit: l.unit, note: l.note ?? null })),
    total,
    suggestedDate,
    steps: trail.entries.map(auditView),
  };
};

type RunResult = Awaited<ReturnType<typeof runOrder>>;

/** Places an order through the full flow: quote, checks, then executed / pending approval / blocked. */
export const placeOrder = (caller: Caller, agent: Agent, req: OrderRequest, ctx: Omit<RunContext, 'dryRun' | 'policyId'> = {}) =>
  runOrder(caller, agent, req, ctx) as Promise<Exclude<RunResult, { preview: true }>>;

/** Dry run of placeOrder: what would happen now, optionally under a draft policy version. Writes nothing. */
export const previewOrder = (caller: Caller, agent: Agent, req: OrderRequest, ctx: Pick<RunContext, 'policyId' | 'clock'> = {}) =>
  runOrder(caller, agent, req, { ...ctx, dryRun: true }) as Promise<Extract<RunResult, { preview: true }>>;

export const openLine = (code: string, quantity: number, note: string): OrderLine => {
  const p = productByCode(code);
  return {
    code,
    name: p?.name ?? code,
    role: 'requested',
    salesUnits: 0,
    salesUnit: p?.salesUnit.name ?? '',
    quantity,
    unit: (p?.salesUnit.base ?? 'l') as OrderLine['unit'],
    unitPrice: p && p.price > 0 ? p.price : 0,
    total: 0,
    deliveryDate: '',
    status: 'open',
    note,
  };
};

// --- Reads -----------------------------------------------------------------------

export const orderDetails = async (organizationId: string, id: string) => {
  const order = await prisma.order.findFirst({ where: { id, organizationId }, include: { approval: true } });
  if (!order) throw new AppError('Order not found', 404, { id });
  const [agent, quote, audit] = await Promise.all([
    order.agentId ? prisma.agent.findFirst({ where: { id: order.agentId, organizationId } }) : null,
    order.quoteId ? prisma.quote.findFirst({ where: { id: order.quoteId, organizationId } }) : null,
    prisma.auditEntry.findMany({ where: { organizationId, orderId: id }, orderBy: { seq: 'asc' } }),
  ]);
  return {
    order: orderView(order, agent, order.approval),
    checks: order.checks,
    quote: quote ? quoteView(quote) : null,
    approval: order.approval ? approvalView(order.approval, order) : null,
    audit: audit.map(auditView),
  };
};

export const listOrders = async (organizationId: string, q: { status?: string; agentId?: string; automationId?: string; limit?: number }) => {
  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.agentId ? { agentId: q.agentId } : {}),
      ...(q.automationId ? { request: { path: ['automationId'], equals: q.automationId } } : {}),
    },
    include: { approval: true },
    orderBy: { createdAt: 'desc' },
    take: q.limit ?? 100,
  });
  const agents = new Map((await prisma.agent.findMany({ where: { organizationId } })).map((a) => [a.id, a]));
  return orders.map((o) => orderView(o, o.agentId ? agents.get(o.agentId) : null, o.approval));
};

export const updateOrder = async (data: Partial<Order> & { id: string }, authorId: string) => {
  const { response, event } = await updateOrderCommand(prisma, data, { authorId });
  await eventStore.log(event!);
  return response;
};

export type { Policy };
