import type { Quote } from '../../../prisma/generated/prisma/index';
import prisma from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import logger from '../../services/logger.ts';
import { AppError } from '../../utils/AppError.ts';
import { createQuoteCommand } from './gateway.commands.ts';
import { lineTotal, sum } from './gateway.money.ts';
import { productByCode } from './gateway.products.ts';
import { keyId, sign, verify } from './gateway.signing.ts';
import type { AvailabilityInfo, PriceInfo, ValioMode } from './valio.client.ts';
import { ValioUnavailable, applyStockCaps, availableBy, chargedPrice, earliestDelivery, fetchAvailability, fetchPrices, valioMode } from './valio.client.ts';

// Signed, time-boxed quotes. The signature covers every field of the quote
// except `signature` itself, so an agent can prove what price and stock the
// gateway stated, and until when.

export const QUOTE_TTL_MS = 15 * 60 * 1000;

export type QuoteItem = { code: string; salesUnits?: number };

export type QuoteLine = {
  code: string;
  name: string;
  salesUnit: { unit: string; contains: number; baseUnit: string };
  quantity: number; // sales units quoted (0 = price/stock only)
  unitPrice: number; // what the buyer pays: Valio's customer net (catalog) price
  listPrice: number | null;
  lineTotal: number;
  currency: 'EUR';
  priceWithTax: number | null;
  taxPercent: number | null;
  comparisonPrice: number | null;
  comparisonUnit: string | null;
  priceValidFrom: string | null;
  priceValidTo: string | null;
  salesBlock: string | null;
  closingTime: string | null;
  cutoffPassed: boolean;
  logisticModel: string | null;
  simulatedCap: number | null;
  deliveries: { date: string; amount: number; salesUnit: string }[];
  availableByRequestedDate: number; // sales units
  earliestDelivery: string | null;
};

export type SignedQuote = {
  id: string;
  issuer: 'ai-mo-gateway';
  kid: string;
  supplier: 'valio-aimo';
  source: 'live' | 'simulator';
  organizationId: string;
  policy: { key: string; version: number } | null;
  requestedDate: string;
  currency: 'EUR';
  lines: QuoteLine[];
  total: number;
  issuedAt: string;
  expiresAt: string;
  signature: string;
};

const quoteId = (at: Date) => `qt_${at.getTime().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export type IssueQuoteInput = {
  organizationId: string;
  requestedDate: string;
  items: QuoteItem[];
  policy?: { id: string; key: string; version: number } | null;
  agentId?: string | null;
  at?: Date;
  authorId: string;
  /** Demo only: cap a product's stock (Valio's mock API never runs out). Recorded on the quote line. */
  stockCaps?: Record<string, number>;
  /** Force the Valio source (seed backfill uses the simulator for past dates). */
  valioMode?: ValioMode;
  /** A dry run: if Valio can't be reached, quote from the simulator (source: 'simulator') instead of failing. */
  estimateIfDown?: boolean;
};

export const issueQuote = async (input: IssueQuoteInput) => {
  const codes = [...new Set(input.items.map((i) => i.code))];
  const known = codes.filter((c) => productByCode(c));
  let mode = input.valioMode ?? valioMode();
  const fetchBoth = (m: ValioMode) => Promise.all([fetchPrices(known, input.requestedDate, m), fetchAvailability(known, input.requestedDate, m)]);
  let fetched: Awaited<ReturnType<typeof fetchBoth>>;
  try {
    fetched = await fetchBoth(mode);
  } catch (err) {
    if (!(err instanceof ValioUnavailable) || !input.estimateIfDown || mode === 'simulator') throw err;
    logger.warn(`Gateway: Valio unreachable for a preview — estimating with the simulator (${(err.details as { cause?: string })?.cause ?? err.message})`);
    mode = 'simulator';
    fetched = await fetchBoth(mode);
  }
  const [prices, liveAvailability] = fetched;
  const availability = applyStockCaps(liveAvailability, input.stockCaps);
  const priceBy = new Map<string, PriceInfo>(prices.map((p) => [p.code, p]));
  const availBy = new Map<string, AvailabilityInfo>(availability.map((a) => [a.code, a]));
  const qty = new Map(input.items.map((i) => [i.code, i.salesUnits ?? 0]));

  const lines: QuoteLine[] = known.map((code) => {
    const p = productByCode(code)!;
    const price = priceBy.get(code);
    const avail = availBy.get(code);
    const unitPrice = chargedPrice(price) ?? p.price;
    // No price → can't be bought at a stated price: quoted as unavailable (fails closed, never a €0 line).
    const priced = unitPrice > 0;
    return {
      code,
      name: p.name,
      salesUnit: { unit: p.salesUnit.name, contains: p.salesUnit.size, baseUnit: p.salesUnit.base },
      quantity: qty.get(code) ?? 0,
      unitPrice,
      listPrice: price?.listPrice ?? null,
      lineTotal: lineTotal(unitPrice, qty.get(code) ?? 0),
      currency: 'EUR',
      priceWithTax: price?.priceWithTax ?? null,
      taxPercent: price?.taxPercent ?? null,
      comparisonPrice: price?.comparisonPrice ?? null,
      comparisonUnit: price?.comparisonUnit ?? null,
      priceValidFrom: price?.validFrom ?? null,
      priceValidTo: price?.validTo ?? null,
      salesBlock: priced ? (avail?.salesBlock ?? null) : 'No price from Valio',
      closingTime: avail?.closingTime ?? null,
      cutoffPassed: avail?.cutoffPassed ?? false,
      logisticModel: avail?.logisticModel ?? null,
      simulatedCap: avail?.simulatedCap ?? null,
      deliveries: avail?.deliveries ?? [],
      availableByRequestedDate: priced ? availableBy(avail, input.requestedDate) : 0,
      earliestDelivery: priced ? earliestDelivery(avail) : null,
    };
  });

  const issuedAt = input.at ?? new Date();
  const unsigned = {
    id: quoteId(issuedAt),
    issuer: 'ai-mo-gateway' as const,
    kid: keyId(),
    supplier: 'valio-aimo' as const,
    source: mode,
    organizationId: input.organizationId,
    policy: input.policy ? { key: input.policy.key, version: input.policy.version } : null,
    requestedDate: input.requestedDate,
    currency: 'EUR' as const,
    lines,
    total: sum(lines.map((l) => l.lineTotal)),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + QUOTE_TTL_MS).toISOString(),
  };
  const signature = sign(unsigned);

  const { event } = await createQuoteCommand(
    prisma,
    {
      id: unsigned.id,
      organizationId: input.organizationId,
      policyId: input.policy?.id ?? null,
      agentId: input.agentId ?? null,
      requestedDate: input.requestedDate,
      lines: lines as object,
      total: unsigned.total,
      issuedAt,
      expiresAt: new Date(unsigned.expiresAt),
      payload: unsigned as object,
      signature,
    },
    { authorId: input.authorId }
  );
  await eventStore.log(event!);

  const quote: SignedQuote = { ...unsigned, signature };
  return { quote, unknownCodes: codes.filter((c) => !productByCode(c)) };
};

export const quoteView = (q: Quote): SignedQuote => ({ ...(q.payload as Omit<SignedQuote, 'signature'>), signature: q.signature });

export const findQuote = async (organizationId: string, id: string) => {
  const q = await prisma.quote.findFirst({ where: { id, organizationId } });
  if (!q) throw new AppError('Quote not found', 404, { id });
  return q;
};

/** Checks the signature over everything but `signature`, then expiry. */
export const verifyQuote = (quote: Record<string, unknown>, now = new Date()) => {
  const { signature, ...payload } = quote;
  const signatureValid = typeof signature === 'string' && verify(payload, signature);
  const expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt : null;
  const expired = !expiresAt || Date.parse(expiresAt) <= now.getTime();
  return {
    valid: signatureValid && !expired,
    signatureValid,
    expired,
    expiresAt,
    kid: payload.kid ?? null,
    reason: !signatureValid ? 'Signature does not match the quote content' : expired ? 'Quote has expired' : null,
  };
};
