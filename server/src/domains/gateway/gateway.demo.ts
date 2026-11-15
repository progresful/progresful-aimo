import { valioMode } from './valio.client.ts';
import { AppError } from '../../utils/AppError.ts';
import type { Caller } from './gateway.auth.ts';
import { actingAgent } from './gateway.auth.ts';
import { expireApproval } from './gateway.approvals.ts';
import { orderDetails, placeOrder } from './gateway.orders.ts';
import type { OrderRequest } from './gateway.orders.ts';
import type { Clock } from './gateway.time.ts';
import { localDay, nextMonday } from './gateway.time.ts';

// The three demo scenarios, run through the real orchestration as the Gemini
// buyer agent. Enabled only with DEMO_MODE=true.

export const DEMO_AGENT_ID = 'agt_gemini';
export const DEMO_DATE = '2026-11-16';

export const demoEnabled = () => process.env.DEMO_MODE === 'true';

/** Mon 16 Nov 2026 while it's still ahead, otherwise the next Monday. */
export const demoDeliveryDate = (now = new Date()) => (DEMO_DATE >= localDay(now) ? DEMO_DATE : nextMonday(localDay(now)));

export type Scenario = 'routine' | 'stockout' | 'timeout';

export const STOCKOUT_CAPS: Record<string, number> = { '464398': 600 };

export const scenarioRequest = (scenario: Scenario, requestedDate: string): OrderRequest => {
  const litres = scenario === 'routine' ? 400 : 1000;
  return {
    lines: [{ code: '464398', quantity: litres, unit: 'l' }],
    requestedDate,
    allowSubstitutes: true,
    note: { routine: 'Standing weekly milk', stockout: 'Stock-out · substitute', timeout: 'Stock-out · approval timed out' }[scenario],
  };
};

/** Runs from the same starting state every time: demo replays don't count toward each other's week spend. */
export const runScenario = async (caller: Caller, scenario: Scenario, clock?: Clock) => {
  // Orgs without the HUS Gemini agent (the judge sandbox) run as their own first agent.
  const agent = caller.agent ?? (await actingAgent(caller, DEMO_AGENT_ID).catch(() => actingAgent(caller)));
  // Valio's mock API never runs out of stock, so the stock-out stories cap 464398 at 600 l themselves.
  const stockCaps = scenario !== 'routine' && valioMode() === 'live' ? STOCKOUT_CAPS : undefined;
  const result = await placeOrder(caller, agent, scenarioRequest(scenario, demoDeliveryDate(clock?.() ?? new Date())), { clock, demoReplay: true, stockCaps });
  if (scenario !== 'timeout') return { scenario, ...result };
  if (!result.approval) throw new AppError('Timeout scenario expected a pending approval', 500, { status: result.order.status });
  const expired = await expireApproval(caller.organizationId, result.approval.id, clock);
  const details = await orderDetails(caller.organizationId, result.order.id);
  return { scenario, decision: result.decision, ...details, audit: [...result.audit, ...expired.audit] };
};
