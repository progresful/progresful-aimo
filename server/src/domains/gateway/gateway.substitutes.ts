import { AppError } from '../../utils/AppError.ts';
import { activePolicy } from './gateway.policies.ts';
import { productByCode, substitutePool } from './gateway.products.ts';
import type { Agent } from '../../../prisma/generated/prisma/index';
import type { PolicyDocument, RequestUnit } from './policy.engine.ts';
import { UnitMismatchError, pickSubstitutes, rankSubstitutes, toBase, toSalesUnits } from './policy.engine.ts';
import { availableBy, chargedPrice, earliestDelivery, fetchAvailability, fetchPrices, passedCutoff } from './valio.client.ts';

/** Read-only ranking under the agent's signed policy — what place_order would pick, without ordering. */
export const rankFor = async (organizationId: string, agent: Agent, input: { code: string; quantity: number; unit: RequestUnit; requestedDate: string }) => {
  const product = productByCode(input.code);
  if (!product) throw new AppError('Product not found', 404, { code: input.code });
  let units: number;
  try {
    units = toSalesUnits(input.quantity, input.unit, product);
  } catch (err) {
    if (err instanceof UnitMismatchError) throw new AppError(err.message, 422);
    throw err;
  }
  const policy = await activePolicy(organizationId, agent.policyId);
  const doc = policy.document as unknown as PolicyDocument;
  const pool = substitutePool(product);
  const codes = [product.code, ...pool.map((p) => p.code)];
  const [prices, avail] = await Promise.all([fetchPrices(codes, input.requestedDate), fetchAvailability(codes, input.requestedDate)]);
  const priceOf = (code: string) => chargedPrice(prices.find((p) => p.code === code)) ?? productByCode(code)!.price;
  const availOf = (code: string) => avail.find((a) => a.code === code);
  const available = availableBy(availOf(product.code), input.requestedDate);
  const shortBase = toBase(Math.max(0, units - available), product);
  const candidates = rankSubstitutes(
    doc,
    product,
    pool.map((p) => ({ product: p, unitPrice: priceOf(p.code), availableUnits: availableBy(availOf(p.code), input.requestedDate), earliestDelivery: earliestDelivery(availOf(p.code)), cutoffPassed: passedCutoff(availOf(p.code)) })),
    input.requestedDate
  );
  // Show the picks for the actual shortfall (or for the whole quantity if nothing is short).
  const { remaining } = pickSubstitutes(candidates, shortBase > 0 ? shortBase : toBase(units, product), new Map(pool.map((p) => [p.code, p])));
  return {
    policy: { key: policy.key, version: policy.version },
    requested: {
      code: product.code,
      name: product.name,
      quantity: toBase(units, product),
      unit: product.salesUnit.base,
      availableByRequestedDate: toBase(available, product),
      short: shortBase,
      requestedDate: input.requestedDate,
    },
    candidates,
    uncovered: remaining,
    order: (doc.rules.find((r) => r.type === 'substitution.rank')?.order as string[]) ?? null,
  };
};
