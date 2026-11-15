import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const code = z.string().min(1).max(32);
const unit = z.enum(['l', 'kg', 'pcs']);
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

export const orderLines = z.array(z.object({ code, quantity: z.number().positive().max(1_000_000), unit })).min(1).max(100);

export const placeOrderBody = z.object({
  lines: orderLines,
  requestedDate: day,
  allowSubstitutes: z.boolean().optional(),
  note: z.string().max(200).optional(),
  idempotencyKey: z.string().min(1).max(100).optional(),
  agentId: z.string().optional(), // web UI only; ignored for agent keys
});
export const placeOrder = z.object({ body: placeOrderBody });

/** Preview may test a draft policy version (web UI only; agent keys always use their bound policy). */
export const previewOrder = z.object({ body: placeOrderBody.extend({ policyId: z.string().optional() }) });

/** Top-level body fields the schema doesn't know (e.g. a self-declared limit) — logged as ignored. */
export const unknownFields = (body: unknown, schema: z.ZodObject<any>) =>
  body && typeof body === 'object' ? Object.keys(body).filter((k) => !(k in schema.shape)) : [];

export const listOrders = z.object({
  query: z.object({
    status: z.enum(['executed', 'pending_approval', 'partial', 'declined', 'blocked', 'expired']).optional(),
    agentId: z.string().optional(),
    automationId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const idParam = z.object({ params: z.object({ id: z.string().min(1) }) });

export const quoteBody = z.object({
  products: z
    .array(z.object({ code, quantity: z.number().nonnegative().max(1_000_000).optional(), unit: unit.optional() }))
    .min(1)
    .max(1000),
  requestedDate: day,
});
export const createQuote = z.object({ body: quoteBody });

export const verifyQuote = z.object({
  body: z.union([z.object({ quote: z.record(z.string(), z.unknown()) }), z.object({ id: z.string().min(1) })]),
});

export const rankBody = z.object({ code, quantity: z.number().positive(), unit, requestedDate: day, agentId: z.string().optional() });
export const rankSubstitutes = z.object({ body: rankBody });

export const listApprovals = z.object({ query: z.object({ status: z.enum(['pending', 'approved', 'declined', 'partial', 'timed_out']).optional() }) });

export const decideApproval = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ decision: z.enum(['approve', 'decline', 'partial']), comment: z.string().max(500).optional() }),
});

export const listAudit = z.object({
  query: z.object({
    orderId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    before: z.coerce.number().int().positive().optional(),
  }),
});

export const productQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  lactoseFree: bool.optional(),
  missingAllergens: bool.optional(),
  hasSubstitute: bool.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export const listProducts = z.object({ query: productQuery });
export const searchProductsBody = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  lactoseFree: z.boolean().optional(),
  missingAllergens: z.boolean().optional(),
  hasSubstitute: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});
export const searchProducts = z.object({ body: searchProductsBody });

export const getProduct = z.object({ params: z.object({ code }) });

const rule = z.object({ key: z.string(), type: z.string() }).catchall(z.unknown());

export const createPolicy = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    plainLanguage: z.string().min(1).max(4000),
    key: z.string().regex(/^pol_[a-z0-9-]+$/, 'Use pol_lowercase-with-dashes').optional(),
  }),
});

export const updatePolicy = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    plainLanguage: z.string().min(1).max(4000).optional(),
    summary: z.string().max(300).optional(),
    rules: z.array(rule).optional(),
  }),
});

/** One sentence → one rule draft. `rules`: the client's unsaved rule list, so the new key doesn't clash with it. */
export const draftRule = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ text: z.string().trim().min(2).max(500), rules: z.array(rule).optional() }),
});

export const signPolicy = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ role: z.string().max(80).optional(), summary: z.string().max(300).optional() }).optional(),
});

export const agentKeyParams = z.object({ params: z.object({ id: z.string().min(1), keyId: z.string().min(1) }) });

export const runDemo = z.object({ body: z.object({ scenario: z.enum(['routine', 'stockout', 'timeout']) }) });

export const boundPolicyQuery = z.object({ query: z.object({ agentId: z.string().optional() }) });

// --- Automations (standing orders) ---------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24 h, Europe/Helsinki)');
export const scheduleBody = z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  time: hhmm,
  leadDays: z.number().int().min(0).max(14),
});

export const createAutomation = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    schedule: scheduleBody,
    lines: orderLines.max(30),
    agentId: z.string().optional(),
    enabled: z.boolean().optional(),
    allowSubstitutes: z.boolean().optional(),
  }),
});

export const updateAutomation = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
    schedule: scheduleBody.partial().optional(),
    lines: orderLines.max(30).optional(),
    allowSubstitutes: z.boolean().optional(),
  }),
});

export const parseRequest = z.object({ body: z.object({ text: z.string().trim().min(1).max(2000), agentId: z.string().optional() }) });

// --- Judge sandbox ------------------------------------------------------------------

export const sandboxKey = z.object({ body: z.object({ agentId: z.string().min(1) }) });
