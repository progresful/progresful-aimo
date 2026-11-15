import type { Request, Response } from 'express';
import prisma from '../../services/database.ts';
import { AppError } from '../../utils/AppError.ts';
import { listAudit, verifyAuditChain, chainHead } from './audit.service.ts';
import { createAgentKey, deleteAgentKey, listAgents } from './gateway.agents.ts';
import { createAutomation, deleteAutomation, listAutomations, getAutomation, runAutomationNow, updateAutomation } from './gateway.automations.ts';
import { decideApproval, expireApproval, listApprovals } from './gateway.approvals.ts';
import { callerOf } from './gateway.auth.ts';
import { demoEnabled, runScenario } from './gateway.demo.ts';
import { listOrders as listOrdersService } from './gateway.orders.ts';
import { compilePolicy, createPolicy as createPolicyService, getPolicy as getPolicyService, listPolicies, signPolicy as signPolicyService, updatePolicy as updatePolicyService, discardDraft as discardDraftService, draftRule as draftRuleService } from './gateway.policies.ts';
import { allProducts, catalogSource } from './gateway.products.ts';
import { findQuote, quoteView, verifyQuote as verifyQuoteService } from './gateway.quotes.ts';
import * as sandboxService from './gateway.sandbox.ts';
import * as service from './gateway.service.ts';
import { keyId, publicJwks } from './gateway.signing.ts';
import { gatewayStats } from './gateway.stats.ts';
import * as v from './gateway.validation.ts';
import { pingValio } from './valio.client.ts';

// --- Public ---------------------------------------------------------------------

export const health = async (_req: Request, res: Response) => {
  const [valio, db] = await Promise.all([pingValio(), prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)]);
  res.json({
    ok: db && valio.ok,
    service: 'ai-mo-gateway',
    valio,
    catalog: { source: catalogSource(), products: allProducts().length },
    signing: { algorithm: 'ed25519', kid: keyId() },
    audit: { head: db ? await chainHead() : null },
    database: db,
    demoMode: process.env.DEMO_MODE === 'true',
    time: new Date().toISOString(),
  });
};

export const keys = async (_req: Request, res: Response) => res.json(publicJwks());

export const verifyQuote = async (req: Request, res: Response) => {
  const { body } = v.verifyQuote.parse(req);
  const quote = 'quote' in body ? body.quote : quoteView((await prisma.quote.findUnique({ where: { id: body.id } })) ?? notFound('Quote', body.id));
  res.json({ quoteId: quote.id ?? null, ...verifyQuoteService(quote as Record<string, unknown>) });
};

const notFound = (what: string, id: string): never => {
  throw new AppError(`${what} not found`, 404, { id });
};

// --- Catalog & quotes -----------------------------------------------------------

export const listProducts = async (req: Request, res: Response) => {
  const { query } = v.listProducts.parse(req);
  res.json({ ...(await service.findProducts(query)), source: catalogSource() });
};

export const searchProducts = async (req: Request, res: Response) => {
  const { body } = v.searchProducts.parse(req);
  res.json({ ...(await service.findProducts({ ...body, q: body.query })), source: catalogSource() });
};

export const getProduct = async (req: Request, res: Response) => res.json(await service.getProduct(v.getProduct.parse(req).params.code));

export const createQuote = async (req: Request, res: Response) => {
  const { body } = v.createQuote.parse(req);
  res.status(201).json(await service.quoteFor(callerOf(res), body, req.query.agentId as string | undefined));
};

export const getQuote = async (req: Request, res: Response) => {
  const { id } = v.idParam.parse(req).params;
  const quote = quoteView(await findQuote(callerOf(res).organizationId, id));
  res.json({ quote, verification: verifyQuoteService(quote as unknown as Record<string, unknown>) });
};

export const rankSubstitutes = async (req: Request, res: Response) => res.json(await service.rankSubstitutesFor(callerOf(res), v.rankSubstitutes.parse(req).body));

// --- Orders -------------------------------------------------------------------------

export const previewOrder = async (req: Request, res: Response) => {
  res.json(await service.previewOrderFor(callerOf(res), v.previewOrder.parse(req).body));
};

export const placeOrder = async (req: Request, res: Response) => {
  const { body } = v.placeOrder.parse(req);
  const result = await service.placeOrderFor(callerOf(res), body, v.unknownFields(req.body, v.placeOrderBody));
  res.status('idempotentReplay' in result ? 200 : 201).json(result);
};

export const listOrders = async (req: Request, res: Response) => {
  const { query } = v.listOrders.parse(req);
  const caller = callerOf(res);
  res.json({ orders: await listOrdersService(caller.organizationId, { ...query, ...(caller.agent ? { agentId: caller.agent.id } : {}) }) });
};

export const getOrder = async (req: Request, res: Response) => res.json(await service.getOrderFor(callerOf(res), v.idParam.parse(req).params.id));

export const stats = async (req: Request, res: Response) => res.json(await gatewayStats(callerOf(res).organizationId, req.query.policy as string | undefined));

// --- Approvals ----------------------------------------------------------------------

export const listApprovalsHandler = async (req: Request, res: Response) => {
  const { query } = v.listApprovals.parse(req);
  res.json({ approvals: await listApprovals(callerOf(res).organizationId, query.status) });
};

export const decide = async (req: Request, res: Response) => {
  const { params, body } = v.decideApproval.parse(req);
  const caller = callerOf(res);
  res.json(await decideApproval(caller.organizationId, params.id, body.decision, { name: caller.user!.name, role: caller.user!.role, comment: body.comment }, caller.authorId));
};

export const expire = async (req: Request, res: Response) => {
  if (!demoEnabled()) throw new AppError('Only available with DEMO_MODE=true', 404);
  res.json(await expireApproval(callerOf(res).organizationId, v.idParam.parse(req).params.id));
};

// --- Audit ----------------------------------------------------------------------------

export const audit = async (req: Request, res: Response) => {
  const { query } = v.listAudit.parse(req);
  const entries = await listAudit(callerOf(res).organizationId, query);
  res.json({ entries, nextBefore: entries.length ? entries[entries.length - 1].seq : null });
};

export const auditVerify = async (_req: Request, res: Response) => res.json(await verifyAuditChain());

// --- Policies ---------------------------------------------------------------------------

export const policies = async (_req: Request, res: Response) => res.json({ policies: await listPolicies(callerOf(res).organizationId) });

export const policy = async (req: Request, res: Response) => res.json(await getPolicyService(callerOf(res).organizationId, v.idParam.parse(req).params.id));

export const boundPolicy = async (req: Request, res: Response) => res.json(await service.boundPolicyFor(callerOf(res), v.boundPolicyQuery.parse(req).query.agentId));

export const createPolicy = async (req: Request, res: Response) => {
  const caller = callerOf(res);
  const created = await createPolicyService(prisma, caller.organizationId, v.createPolicy.parse(req).body, caller.authorId);
  res.status(201).json(await getPolicyService(caller.organizationId, created.key));
};

export const updatePolicy = async (req: Request, res: Response) => {
  const { params, body } = v.updatePolicy.parse(req);
  const caller = callerOf(res);
  res.json(await updatePolicyService(caller.organizationId, params.id, body, caller.authorId));
};

export const compile = async (req: Request, res: Response) => {
  const caller = callerOf(res);
  res.json(await compilePolicy(caller.organizationId, v.idParam.parse(req).params.id, caller.authorId));
};

export const draftRule = async (req: Request, res: Response) => {
  const { params, body } = v.draftRule.parse(req);
  const started = Date.now();
  const result = await draftRuleService(callerOf(res).organizationId, params.id, body as { text: string; rules?: any[] });
  res.json({ ...result, ms: Date.now() - started });
};

export const discardDraft = async (req: Request, res: Response) => {
  const caller = callerOf(res);
  res.json(await discardDraftService(caller.organizationId, v.idParam.parse(req).params.id, caller.authorId));
};

export const sign = async (req: Request, res: Response) => {
  const { params, body } = v.signPolicy.parse(req);
  const caller = callerOf(res);
  const signed = await signPolicyService(prisma, caller.organizationId, params.id, { name: caller.user!.name, role: body?.role ?? caller.user!.role, summary: body?.summary }, caller.authorId);
  res.json(await getPolicyService(caller.organizationId, signed.key));
};

// --- Agents -------------------------------------------------------------------------------

export const agents = async (_req: Request, res: Response) => res.json({ agents: await listAgents(callerOf(res).organizationId) });

export const createKey = async (req: Request, res: Response) => {
  const caller = callerOf(res);
  res.status(201).json(await createAgentKey(caller.organizationId, v.idParam.parse(req).params.id, caller.user!));
};

export const deleteKey = async (req: Request, res: Response) => {
  const { params } = v.agentKeyParams.parse(req);
  const caller = callerOf(res);
  await deleteAgentKey(caller.organizationId, params.id, params.keyId, caller.authorId);
  res.sendStatus(204);
};

// --- Demo --------------------------------------------------------------------------------------

export const demoRun = async (req: Request, res: Response) => {
  if (!demoEnabled()) throw new AppError('Only available with DEMO_MODE=true', 404);
  res.status(201).json(await runScenario(callerOf(res), v.runDemo.parse(req).body.scenario));
};

// --- Automations (standing orders) ------------------------------------------------------------

export const automations = async (_req: Request, res: Response) => res.json({ automations: await listAutomations(callerOf(res)) });

export const automation = async (req: Request, res: Response) => res.json(await getAutomation(callerOf(res), v.idParam.parse(req).params.id));

export const createAutomationHandler = async (req: Request, res: Response) => {
  const caller = callerOf(res);
  const created = await createAutomation(caller.organizationId, v.createAutomation.parse(req).body, caller.authorId);
  res.status(201).json(await getAutomation(caller, created.id));
};

export const updateAutomationHandler = async (req: Request, res: Response) => {
  const { params, body } = v.updateAutomation.parse(req);
  res.json(await updateAutomation(callerOf(res), params.id, body));
};

export const deleteAutomationHandler = async (req: Request, res: Response) => {
  await deleteAutomation(callerOf(res), v.idParam.parse(req).params.id);
  res.sendStatus(204);
};

export const runAutomation = async (req: Request, res: Response) => res.status(201).json(await runAutomationNow(callerOf(res), v.idParam.parse(req).params.id));

// --- Plain-language requests ------------------------------------------------------------------

export const parseRequest = async (req: Request, res: Response) => res.json(await service.parseRequestFor(callerOf(res), v.parseRequest.parse(req).body));

// --- Judge sandbox --------------------------------------------------------------------------------

export const sandbox = async (_req: Request, res: Response) => res.json(await sandboxService.sandboxInfo(callerOf(res)));

export const sandboxKey = async (req: Request, res: Response) => res.status(201).json(await sandboxService.issueSandboxKey(callerOf(res), v.sandboxKey.parse(req).body.agentId));

export const sandboxReset = async (_req: Request, res: Response) => res.json(await sandboxService.resetSandbox(callerOf(res)));
