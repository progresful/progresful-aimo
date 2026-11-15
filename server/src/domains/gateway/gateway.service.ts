import type { z } from 'zod';
import { AppError } from '../../utils/AppError.ts';
import type { Caller } from './gateway.auth.ts';
import { actingAgent } from './gateway.auth.ts';
import { orderDetails, placeOrder, previewOrder } from './gateway.orders.ts';
import { activePolicy, getPolicy, policyView } from './gateway.policies.ts';
import type { ProductFilter } from './gateway.products.ts';
import { productByCode, productView, searchProducts } from './gateway.products.ts';
import { listPrices } from './gateway.prices.ts';
import { issueQuote } from './gateway.quotes.ts';
import { parseRequest } from './gateway.parse.ts';
import { rankFor } from './gateway.substitutes.ts';
import type * as v from './gateway.validation.ts';
import { UnitMismatchError, toSalesUnits } from './policy.engine.ts';

// The operations agents use, shared by the REST controller and the MCP server
// so both interfaces behave identically.

/** One page of ranked products, each with Valio's live list price (cached 10 min). */
export const findProducts = async (filter: ProductFilter) => {
  const page = searchProducts(filter);
  const prices = await listPrices(page.products.map((p) => p.code));
  return { ...page, products: page.products.map((p) => productView(p, prices.get(p.code))) };
};

export const getProduct = async (code: string) => {
  const p = productByCode(code);
  if (!p) throw new AppError('Product not found', 404, { code });
  const prices = await listPrices([code]);
  return productView(p, prices.get(code));
};

/** Quantities are sales units, or litres / kg / pieces when `unit` is given. */
export const quoteFor = async (caller: Caller, input: z.infer<typeof v.quoteBody>, agentId?: string) => {
  const agent = caller.agent ?? (await actingAgent(caller, agentId).catch(() => null));
  const policy = agent ? await activePolicy(caller.organizationId, agent.policyId).catch(() => null) : null;
  const items = input.products.map((line) => {
    const p = productByCode(line.code);
    if (!p || line.quantity === undefined) return { code: line.code, salesUnits: line.quantity ?? 0 };
    try {
      return { code: line.code, salesUnits: line.unit ? toSalesUnits(line.quantity, line.unit, p) : Math.ceil(line.quantity) };
    } catch (err) {
      if (err instanceof UnitMismatchError) throw new AppError(err.message, 422);
      throw err;
    }
  });
  return issueQuote({ organizationId: caller.organizationId, requestedDate: input.requestedDate, items, policy, agentId: agent?.id ?? null, authorId: caller.authorId });
};

export const rankSubstitutesFor = async (caller: Caller, input: z.infer<typeof v.rankBody>) => rankFor(caller.organizationId, await actingAgent(caller, input.agentId), input);

export const placeOrderFor = async (caller: Caller, input: z.infer<typeof v.placeOrderBody>, ignoredFields: string[] = []) => {
  const { agentId, ...request } = input;
  const agent = await actingAgent(caller, agentId);
  return placeOrder(caller, agent, request, { ignoredFields });
};

/** Dry run of placeOrderFor: real quote + policy checks, nothing ordered or logged. */
export const previewOrderFor = async (caller: Caller, input: z.infer<typeof v.placeOrderBody> & { policyId?: string }) => {
  const { agentId, policyId, ...request } = input;
  const agent = await actingAgent(caller, agentId);
  // Testing a draft is for people editing the policy; an agent key never picks its policy.
  return previewOrder(caller, agent, request, { policyId: caller.agent ? undefined : policyId });
};

export const getOrderFor = async (caller: Caller, id: string) => {
  const details = await orderDetails(caller.organizationId, id);
  // Agents see their own orders only.
  if (caller.agent && details.order.agent?.id !== caller.agent.id) throw new AppError('Order not found', 404, { id });
  return details;
};

/** The signed policy the caller's agent is bound to (read-only for agents). */
export const boundPolicyFor = async (caller: Caller, agentId?: string) => {
  const agent = await actingAgent(caller, agentId);
  const active = await activePolicy(caller.organizationId, agent.policyId);
  const { versions: _versions, ...policy } = await getPolicy(caller.organizationId, agent.policyId);
  return { agent: { id: agent.id, name: agent.name }, policy: { ...policyView(active), agents: policy.agents } };
};

/** Plain language → draft order lines resolved against our catalog. Never places an order. */
export const parseRequestFor = async (caller: Caller, input: { text: string; agentId?: string }) => {
  // Only checks the agent belongs to the caller's org (an agent key always acts as itself).
  if (!caller.agent && input.agentId) await actingAgent(caller, input.agentId);
  return parseRequest(input.text);
};
