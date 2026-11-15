// Typed client for the AI-MO gateway (/api/gw). Shapes mirror the server's
// views (server/src/domains/gateway/gateway.views.ts) and the OpenAPI document
// served at /api/openapi.json. Every query key starts with 'gw' so a mutation
// can refresh the whole gateway state with one invalidate.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// --- Shapes ------------------------------------------------------------------

export type Unit = 'l' | 'kg' | 'pcs';
export type StepId = 'request' | 'lookup' | 'stock' | 'substitutes' | 'lactose' | 'policy' | 'approval' | 'order' | 'audit';
export type EntryStatus = 'auto' | 'pending' | 'blocked' | 'skipped';
export type Actor = 'buyer-agent' | 'gateway' | 'valio-api' | 'policy' | 'head-chef';

export type OrderStatus = 'executed' | 'pending_approval' | 'partial' | 'declined' | 'blocked' | 'expired';
export type ApprovalStatus = 'pending' | 'approved' | 'declined' | 'partial' | 'timed_out';
export type LineStatus = 'ordered' | 'proposed' | 'not_ordered' | 'blocked' | 'open';

export type OrderLine = {
  code: string;
  name: string;
  role: 'requested' | 'substitute';
  quantity: number;
  unit: Unit;
  salesUnit: string;
  salesUnits: number;
  unitPrice: number;
  total: number;
  deliveryDate: string;
  status: LineStatus;
  substituteFor?: string;
  note?: string;
};

export type Check = {
  rule: string;
  title: string;
  detail: string;
  passed: boolean;
  severity: 'hard' | 'approval' | 'info';
  observed?: unknown;
  limit?: unknown;
  /** order.nonEmpty: a later date Valio can deliver on. */
  suggestedDate?: string;
  /** false: a scoped rule none of the lines fall under — it passes without applying. */
  applies?: boolean;
};

export type Candidate = {
  for: string;
  code: string;
  name: string;
  rank: number | null;
  score: number;
  verdict: 'picked' | 'blocked' | 'late' | 'ranked' | string;
  reason: string;
  lacs: number | null;
  reliability: number;
  unitPrice: number;
  pricePerBase: number;
  salesUnit: string;
  availableBase: number;
  valioSubstitute: boolean;
  earliestDelivery: string | null;
};

export type AgentRef = { id: string; name?: string; vendor?: string; model?: string };

export type Order = {
  id: string;
  title: string;
  status: OrderStatus;
  policy: { id: string; key: string; version: number };
  agent: AgentRef | null;
  request: { lines: { code: string; quantity: number; unit: Unit }[]; requestedDate: string; note?: string; allowSubstitutes?: boolean };
  requestedDate: string;
  deliveryDate: string;
  lines: OrderLine[];
  open: { code: string; name: string; quantity: number; unit: Unit; note: string | null }[];
  total: number;
  committedTotal: number;
  quoteId: string | null;
  checks: Check[];
  candidates: Candidate[];
  approval: {
    id: string;
    status: ApprovalStatus;
    approver: Person;
    expiresAt: string;
    decidedBy: string | null;
    decidedAt: string | null;
  } | null;
  /** Set when a scheduled automation placed the order. */
  automationId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Person = { name: string; role: string };

export type Tradeoff = {
  code: string;
  substituteFor: string;
  quantity: number;
  unit: Unit;
  costDelta: number;
  fat: { from: number; to: number } | null;
  summary: string;
};

export type Approval = {
  id: string;
  orderId: string;
  status: ApprovalStatus;
  approver: Person;
  reasons: { rule: string; detail: string; severity: string }[];
  proposal: { lines: OrderLine[]; total: number } | null;
  fallback: { lines: OrderLine[]; total: number; description: string };
  tradeoffs: Tradeoff[];
  expiresAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decidedRole: string | null;
  comment: string | null;
  signature: string | null;
  signatureShort: string | null;
  createdAt: string;
};

/** Approvals in the inbox list also carry their order summary and the requesting agent. */
export type ApprovalListItem = Approval & {
  order: Pick<Order, 'id' | 'title' | 'status' | 'request' | 'deliveryDate' | 'candidates' | 'quoteId' | 'checks'>;
  agent: AgentRef | null;
};

export type QuoteLine = {
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  currency: string;
  salesUnit: { unit: string; baseUnit: string; contains: number };
  deliveries: { date: string; amount: number; salesUnit: string }[];
  salesBlock: string | null;
  taxPercent: number;
  priceWithTax: number;
  closingTime: string | null;
  /** The order cut-off for the requested date has passed. */
  cutoffPassed?: boolean;
  logisticModel?: string | null;
  /** Demo stock-out: stock capped by the gateway on top of live Valio data. */
  simulatedCap?: number | null;
  listPrice?: number | null;
  earliestDelivery: string | null;
};

export type Quote = {
  id: string;
  kid: string;
  lines: QuoteLine[];
  total?: number;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  [key: string]: unknown;
};

export type AuditEntry = {
  seq: number;
  id: string;
  at: string;
  orderId: string | null;
  step: StepId;
  status: EntryStatus;
  actor: Actor;
  message: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
};

export type OrderResult = {
  decision: 'execute' | 'needs_approval' | 'block';
  order: Order;
  checks: Check[];
  quote: Quote | null;
  approval: Approval | null;
  audit: AuditEntry[];
};

export type OrderDetail = { order: Order; checks: Check[]; quote: Quote | null; approval: Approval | null; audit: AuditEntry[] };

export type Stats = {
  week: { ordersThisWeek: number; byStatus: Partial<Record<OrderStatus, number>> };
  autoApprovedShare: number;
  spend: {
    policyKey: string;
    thisWeek: number;
    demoReplays: number;
    demoReplaySpend: number;
    limitPerWeek: number;
    limitPerOrder: number;
    currency: string;
  };
  pendingApprovals: number;
  medianApprovalMinutes: number | null;
  auditEntriesToday: number;
  blockedThisWeek: number;
};

export type PolicyRule = { key: string; type: string; hard?: boolean; [field: string]: unknown };

export type PolicyVersion = {
  id: string;
  key: string;
  name: string;
  version: number;
  status: 'draft' | 'signed' | 'superseded';
  plainLanguage: string;
  summary: string | null;
  rules: PolicyRule[];
  approver: (Person & { windowMinutes?: number; fallback?: string }) | null;
  document: Record<string, unknown>;
  signature: {
    signedBy: string;
    role: string;
    signedAt: string | null;
    value: string;
    short?: string;
    kid?: string;
    algorithm?: string;
    valid?: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type Policy = PolicyVersion & {
  activeVersion: number | null;
  hasDraft: boolean;
  agents: AgentRef[];
  versions?: PolicyVersion[];
};

export type Agent = {
  id: string;
  name: string;
  vendor: string;
  model: string;
  host: string;
  transport: 'mcp' | 'openapi';
  policy: { key: string; version: number | null; name: string | null };
  key: {
    id: string;
    start: string;
    prefix: string;
    enabled: boolean;
    createdAt: string;
    lastRequest: string | null;
    requestCount: number;
  } | null;
  stats: { ordersPlaced: number; approvalsRequested: number; blocked: number; auditEntriesToday: number };
  createdAt: string;
};

export type Product = {
  code: string;
  name: string;
  category: string;
  categoryCode: string;
  group: string;
  vendor: string;
  origin: string;
  temperatureClass: 'chilled' | 'ambient' | 'frozen' | string;
  salesUnit: {
    unit: string;
    contains: number;
    baseUnit: string;
    variableWeight?: boolean;
    measureSource?: string;
    baseUnitCode?: string | null;
    baseUnitsPerSalesUnit?: number | null;
  };
  names?: { en: string; fi: string | null; sv: string | null };
  brand?: string | null;
  packaging: { perCase: number; perPallet: number };
  /**
   * Valio's list price. With the real catalog it's fetched live on demand: `source: 'live'`
   * when Valio quoted it, `'unknown'` (amount null) when the product is price-on-quote.
   */
  listPrice: {
    amount: number | null;
    currency?: string;
    per: string;
    perBaseUnit: number | null;
    simulated?: boolean;
    source?: 'live' | 'unknown' | string;
  };
  nutritionPer100g: Record<string, number> | null;
  /** Allergen codes the product CONTAINS (null = no allergen data in the file). */
  allergens: string[] | null;
  allergenLabels: string[] | null;
  /** Codes it MAY_CONTAIN (traces), when the file says so. */
  mayContain?: string[] | null;
  mayContainLabels?: string[] | null;
  /** Per-allergen detail, when provided: level CONTAINS / MAY_CONTAIN / FREE_FROM. */
  allergenDetails?: { code: string; label?: string; level: string }[] | null;
  valioSubstitutes: string[];
  deliveryReliability: number | null;
  co2eKgPerKg: number | null;
  sample: boolean;
  flags: {
    lactoseFree: boolean | null;
    autoSelectable: boolean;
    reason?: string;
    /** Set when only pieces are known (no litre/kg content). */ measure?: string;
  };
};

export type Health = {
  ok: boolean;
  valio: { mode: 'live' | 'simulator'; ok: boolean; status?: number; latencyMs?: number };
  catalog: { source: string; products: number };
  signing: { algorithm: string; kid: string };
  audit: { head: string };
  demoMode: boolean;
  time: string;
};

export type ChainVerification = { ok: boolean; entries: number; head: string; headShort?: string; brokenAt?: number };

export type Scenario = 'routine' | 'stockout' | 'timeout';

// --- Queries -----------------------------------------------------------------

const GW = '/api/gw';
const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && s.set(k, String(v)));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const useHealth = () =>
  useQuery({ queryKey: ['gw', 'health'], queryFn: () => api.get<Health>(`${GW}/health`), refetchInterval: 30_000 });

export const useStats = () => useQuery({ queryKey: ['gw', 'stats'], queryFn: () => api.get<Stats>(`${GW}/stats`) });

export const useOrders = (params: { status?: OrderStatus; limit?: number; automationId?: string } = {}) =>
  useQuery({
    queryKey: ['gw', 'orders', params],
    queryFn: () => api.get<{ orders: Order[] }>(`${GW}/orders${qs(params)}`).then((r) => r.orders),
  });

export const useOrder = (id: string | null | undefined) =>
  useQuery({ queryKey: ['gw', 'order', id], queryFn: () => api.get<OrderDetail>(`${GW}/orders/${id}`), enabled: !!id });

export const useApprovals = (params: { status?: ApprovalStatus } = {}) =>
  useQuery({
    queryKey: ['gw', 'approvals', params],
    queryFn: () => api.get<{ approvals: ApprovalListItem[] }>(`${GW}/approvals${qs(params)}`).then((r) => r.approvals),
    // The server times approvals out on its own; keep the inbox fresh.
    refetchInterval: 15_000,
  });

export const useAudit = (params: { orderId?: string; limit?: number; before?: number } = {}) =>
  useQuery({
    queryKey: ['gw', 'audit', params],
    queryFn: () => api.get<{ entries: AuditEntry[]; nextBefore: number | null }>(`${GW}/audit${qs(params)}`),
  });

export const usePolicies = () =>
  useQuery({ queryKey: ['gw', 'policies'], queryFn: () => api.get<{ policies: Policy[] }>(`${GW}/policies`).then((r) => r.policies) });

export const usePolicy = (id: string | null | undefined) =>
  useQuery({ queryKey: ['gw', 'policy', id], queryFn: () => api.get<Policy>(`${GW}/policies/${id}`), enabled: !!id });

export const useAgents = () =>
  useQuery({ queryKey: ['gw', 'agents'], queryFn: () => api.get<{ agents: Agent[] }>(`${GW}/agents`).then((r) => r.agents) });

export type ProductFilters = { q?: string; category?: string; lactoseFree?: boolean; missingAllergens?: boolean; hasSubstitute?: boolean };

/** One page of products (the catalog is large — pass a `limit`). `enabled: false` skips the request. */
export const useProducts = (filters: ProductFilters & { limit?: number } = {}, opts: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: ['gw', 'products', filters],
    queryFn: () => api.get<{ products: Product[] }>(`${GW}/products${qs(filters)}`).then((r) => r.products),
    placeholderData: (prev) => prev,
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
  });

export const useProduct = (code: string | null | undefined) =>
  useQuery({ queryKey: ['gw', 'product', code], queryFn: () => api.get<Product>(`${GW}/products/${code}`), enabled: !!code });

// --- Mutations ---------------------------------------------------------------

/** Wraps a mutation so every success refreshes all gateway queries. */
const useGwMutation = <TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) => {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ['gw'] }) });
};

export const useRunScenario = () => useGwMutation((scenario: Scenario) => api.post<OrderResult>(`${GW}/demo/run`, { scenario }));

export const usePlaceOrder = () =>
  useGwMutation(
    (body: {
      agentId: string;
      idempotencyKey?: string;
      lines: { code: string; quantity: number; unit: Unit }[];
      requestedDate: string;
      allowSubstitutes?: boolean;
      note?: string;
    }) => api.post<OrderResult>(`${GW}/orders`, body)
  );

export const useDecide = () =>
  useGwMutation(({ id, decision, comment }: { id: string; decision: 'approve' | 'decline' | 'partial'; comment?: string }) =>
    api.post<{ approval: Approval; order: Order; audit: AuditEntry[] }>(`${GW}/approvals/${id}/decide`, { decision, comment })
  );

export const useExpireApproval = () =>
  useGwMutation((id: string) => api.post<{ approval: Approval; order: Order; audit: AuditEntry[] }>(`${GW}/approvals/${id}/expire`));

export const useVerifyChain = () => useMutation({ mutationFn: () => api.get<ChainVerification>(`${GW}/audit/verify`) });

export const useCreatePolicy = () =>
  useGwMutation((body: { name: string; plainLanguage: string; key?: string }) => api.post<Policy>(`${GW}/policies`, body));

export const useUpdatePolicy = () =>
  useGwMutation(({ id, ...body }: { id: string; plainLanguage?: string; name?: string; summary?: string; rules?: PolicyRule[] }) =>
    api.patch<Policy>(`${GW}/policies/${id}`, body)
  );

/** Recompiles the policy's current plain language into rules (save the text with useUpdatePolicy first). */
export const useCompilePolicy = () => useGwMutation((id: string) => api.post<CompileResult>(`${GW}/policies/${id}/compile`));

export const useSignPolicy = () =>
  useGwMutation(({ id, role, summary }: { id: string; role?: string; summary?: string }) =>
    api.post<Policy>(`${GW}/policies/${id}/sign`, { role, summary })
  );

export const useCreateAgentKey = () =>
  useGwMutation(({ agentId }: { agentId: string }) =>
    api.post<{ agentId: string; keyId: string; key: string; start: string; prefix: string; createdAt: string; note: string }>(
      `${GW}/agents/${agentId}/keys`
    )
  );

export const useRevokeAgentKey = () =>
  useGwMutation(({ agentId, keyId }: { agentId: string; keyId: string }) => api.delete<void>(`${GW}/agents/${agentId}/keys/${keyId}`));

// --- Audit pagination (added for the audit trail page) ----------------------------

export type AuditPage = { entries: AuditEntry[]; nextBefore: number | null };

/** Audit log newest first, one page per "Load older"; `nextBefore` is the oldest loaded seq. */
export const useAuditPages = (params: { orderId?: string; limit?: number } = {}) => {
  const limit = params.limit ?? 100;
  return useInfiniteQuery({
    queryKey: ['gw', 'audit', 'pages', { ...params, limit }],
    queryFn: ({ pageParam }) => api.get<AuditPage>(`${GW}/audit${qs({ orderId: params.orderId, limit, before: pageParam })}`),
    initialPageParam: undefined as number | undefined,
    // A short page means we reached the start of the log.
    getNextPageParam: (last) => (last.entries.length === limit && last.nextBefore && last.nextBefore > 1 ? last.nextBefore : undefined),
  });
};

// --- Additions (policies / agents / catalog pages) ----------------------------

/** POST /policies/:id/compile — the recompiled policy plus how it was compiled. */
export type CompileResult = { policy: Policy; compiler: 'gemini' | 'rules'; intent: Record<string, unknown>; note?: string };

export type OpenApiDocument = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, { summary?: string; tags?: string[]; security?: Record<string, string[]>[] }>>;
};

/** The public OpenAPI document the gateway serves (no auth needed). */
export const useOpenApi = () =>
  useQuery({ queryKey: ['gw', 'openapi'], queryFn: () => api.get<OpenApiDocument>('/api/openapi.json'), staleTime: 5 * 60_000 });

/** One order's detail as a query definition, for imperative loads (e.g. opening a past run on the playbook). */
export const orderQuery = (id: string) => ({
  queryKey: ['gw', 'order', id] as const,
  queryFn: () => api.get<OrderDetail>(`${GW}/orders/${id}`),
});

// --- Automations & request parsing (home hub) ---------------------------------

export type AutomationSchedule = { /** 1 = Mon … 7 = Sun */ days: number[]; /** 'HH:MM', Helsinki */ time: string; leadDays: number };

export type Automation = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  schedule: AutomationSchedule;
  scheduleLabel: string;
  lines: { code: string; name: string; quantity: number; unit: Unit }[];
  allowSubstitutes: boolean;
  agent: { id: string; name: string };
  policy: { key: string; version: number; name: string };
  lastRun: { orderId: string; status: OrderStatus; at: string; total: number; committedTotal: number } | null;
  nextRunAt: string | null;
  runsLast7Days: number;
  createdAt: string;
  updatedAt: string;
};

export type AutomationInput = {
  name: string;
  description?: string | null;
  schedule: AutomationSchedule;
  lines: { code: string; quantity: number; unit: Unit }[];
  agentId?: string;
  enabled?: boolean;
  allowSubstitutes?: boolean;
};

export type ParsedLine = {
  code: string;
  name: string;
  quantity: number;
  unit: Unit;
  salesUnit: string;
  matched: boolean;
  confidence: number;
  alternatives: { code: string; name: string }[];
};

export type ParsedRequest = {
  text: string;
  lines: ParsedLine[];
  requestedDate: string | null;
  dateText: string | null;
  unmatched: string[];
  parser: 'gemini' | 'rules';
  notes: string[];
  /** The rules the words state ("local only", "lactose-free", "under €300"): the rule, its sentence, the words. Never product words. */
  rules: RequestRule[];
};

/** A rule a request states, with the words it came from (e.g. "local only"). */
export type RequestRule = { rule: PolicyRule; sentence: string; words: string };

export const useAutomations = () =>
  useQuery({
    queryKey: ['gw', 'automations'],
    queryFn: () => api.get<{ automations: Automation[] }>(`${GW}/automations`).then((r) => r.automations),
  });

export const useCreateAutomation = () => useGwMutation((body: AutomationInput) => api.post<Automation>(`${GW}/automations`, body));

export const useUpdateAutomation = () =>
  useGwMutation(({ id, ...body }: Partial<AutomationInput> & { id: string }) => api.patch<Automation>(`${GW}/automations/${id}`, body));

export const useDeleteAutomation = () => useGwMutation((id: string) => api.delete<void>(`${GW}/automations/${id}`));

export const useRunAutomation = () =>
  useGwMutation((id: string) => api.post<OrderResult & { automationId: string }>(`${GW}/automations/${id}/run`));

/** Free text → product lines + delivery date. Doesn't change gateway state, so no invalidation. */
export const useParseRequest = () =>
  useMutation({ mutationFn: (body: { text: string; agentId?: string }) => api.post<ParsedRequest>(`${GW}/requests/parse`, body) });

// --- Order preview (order workspace) ----------------------------------------------

export type OrderRequestBody = {
  agentId: string;
  lines: { code: string; quantity: number; unit: Unit }[];
  requestedDate: string;
  allowSubstitutes?: boolean;
  note?: string;
};

/** POST /orders/preview — a dry run: real signed quote, real policy, nothing written. `steps` carry the graph's step ids. */
export type OrderPreview = {
  preview: true;
  decision: 'execute' | 'needs_approval' | 'block';
  checks: Check[];
  quote: Quote | null;
  candidates: Candidate[];
  lines: OrderLine[];
  open: Order['open'];
  total: number;
  /** Blocked because Valio can't deliver on the asked date: the earliest date it can. */
  suggestedDate: string | null;
  steps: AuditEntry[];
};

/** Dry-runs an order. Writes nothing, so it never invalidates other gateway queries. */
export const usePreviewOrder = () =>
  useMutation({ mutationFn: (body: OrderRequestBody) => api.post<OrderPreview>(`${GW}/orders/preview`, body) });

// --- Playbook editor (edit the policy on the graph) -------------------------------

/** Preview body that may name a specific policy version (e.g. the unsigned draft). Session only. */
export type PolicyPreviewBody = OrderRequestBody & { policyId?: string };

/**
 * Dry-runs an order against a given policy version (signed or draft). Writes nothing and
 * keeps out of the global ['gw'] invalidation, like usePreviewOrder.
 */
export const usePreviewPolicyOrder = () =>
  useMutation({ mutationFn: (body: PolicyPreviewBody) => api.post<OrderPreview>(`${GW}/orders/preview`, body) });

/** DELETE /policies/:id/draft — throws away the unsigned draft; agents keep the signed version. */
export const useDiscardPolicyDraft = () => useGwMutation((id: string) => api.delete<Policy>(`${GW}/policies/${id}/draft`));

// --- Rules on the fly (describe a rule in words) ------------------------------------

/** POST /policies/:id/rules/draft — one sentence → one proposed rule. Writes nothing. */
export type DraftRuleResult = {
  rule: PolicyRule | null;
  /** The rule as a plain sentence, written by the server. */
  sentence: string | null;
  /** false: the gateway can't enforce this kind of rule; `notes` say why. */
  supported: boolean;
  compiler: 'gemini' | 'rules' | string;
  notes: string[];
  warnings: string[];
};

/** Proposes a rule from a sentence. Doesn't change gateway state, so no invalidation. */
export const useDraftRule = () =>
  useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.post<DraftRuleResult>(`${GW}/policies/${id}/rules/draft`, { text }),
  });

// --- Judge sandbox ("Try it yourself") ----------------------------------------------

/** GET /sandbox — whether this organisation is a judge's private test kitchen. */
export type Sandbox =
  | {
      sandbox: true;
      org: { id: string; name: string };
      policy: { key: string; version: number };
      agents: { id: string; name: string }[];
      /** When the sandbox was last reset; older activity belongs to an earlier session. */
      resetAt: string | null;
      mcpUrl?: string;
      openapiUrl?: string;
    }
  | { sandbox: false };

/** Sandbox status. A server without the endpoint (404) or any error reads as "not a sandbox". */
export const useSandbox = () =>
  useQuery({
    queryKey: ['gw', 'sandbox'],
    queryFn: () => api.get<Sandbox>(`${GW}/sandbox`).catch((): Sandbox => ({ sandbox: false })),
    staleTime: 60_000,
  });

/** POST /sandbox/reset — wipes the sandbox's orders, approvals and drafts; refreshes everything. */
export const useResetSandbox = () => useGwMutation(() => api.post<unknown>(`${GW}/sandbox/reset`));

/** POST /sandbox/key — a fresh key for a sandbox agent. The full key is returned once. */
export const useSandboxKey = () =>
  useGwMutation(({ agentId }: { agentId: string }) =>
    api.post<{ agentId: string; key: string; start: string }>(`${GW}/sandbox/key`, { agentId })
  );

/** Only what happened after the last sandbox reset (client-side; null resetAt keeps everything). */
export const afterReset = <T extends { at?: string; createdAt?: string }>(items: T[], resetAt: string | null | undefined): T[] => {
  if (!resetAt) return items;
  const t = new Date(resetAt).getTime();
  return items.filter((x) => new Date(x.at ?? x.createdAt ?? 0).getTime() >= t);
};

// --- Catalog paging (real Valio product file) ---------------------------------------

/**
 * One page of GET /products. The full catalog is paged; the server may answer with
 * any of `total`, `offset`/`nextOffset` or `page`/`pages` — read through `nextOffsetOf`.
 */
export type ProductPage = {
  products: Product[];
  total?: number;
  limit?: number;
  offset?: number;
  nextOffset?: number | null;
  page?: number;
  pages?: number;
  hasMore?: boolean;
  source?: string;
  /** Category facets for the whole result, when the server provides them. */
  categories?: ({ code?: string; name?: string; label?: string; count?: number } | string)[];
};

const nextOffsetOf = (last: ProductPage, offset: number, limit: number): number | undefined => {
  if (last.nextOffset !== undefined) return last.nextOffset ?? undefined;
  if (last.hasMore === false) return undefined;
  const next = offset + last.products.length;
  if (typeof last.total === 'number') return next < last.total ? next : undefined;
  if (typeof last.page === 'number' && typeof last.pages === 'number') return last.page < last.pages ? next : undefined;
  // No paging info: a full page means there may be more.
  return last.products.length >= limit ? next : undefined;
};

/** Catalog search with "Load more": `limit` products per page, offset-based. */
export const useProductPages = (filters: ProductFilters = {}, limit = 50) =>
  useInfiniteQuery({
    queryKey: ['gw', 'products', 'pages', { ...filters, limit }],
    queryFn: ({ pageParam }) => api.get<ProductPage>(`${GW}/products${qs({ ...filters, limit, offset: pageParam || undefined })}`),
    initialPageParam: 0,
    getNextPageParam: (last, _all, offset) => nextOffsetOf(last, offset, limit),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

/** One product as a query definition, for useQueries / imperative loads. */
export const productQuery = (code: string) => ({
  queryKey: ['gw', 'product', code] as const,
  queryFn: () => api.get<Product>(`${GW}/products/${code}`),
  staleTime: 60_000,
});
