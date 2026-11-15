// Hand-written OpenAPI 3.1 description of the AI-MO gateway (/api/gw/*).
// Served at GET /api/openapi.json. Keep in sync with gateway.routes.ts.

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const arr = (items: object) => ({ type: 'array', items });
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const str = (description?: string, extra: object = {}) => ({ type: 'string', ...(description ? { description } : {}), ...extra });
const num = (description?: string) => ({ type: 'number', ...(description ? { description } : {}) });
const int = (description?: string) => ({ type: 'integer', ...(description ? { description } : {}) });
const bool = (description?: string) => ({ type: 'boolean', ...(description ? { description } : {}) });
const date = str('Calendar date, YYYY-MM-DD', { format: 'date' });
const dateTime = str(undefined, { format: 'date-time' });
const obj = (properties: Record<string, object>, required: string[] = Object.keys(properties), extra: object = {}) => ({ type: 'object', properties, required, ...extra });

const json = (schema: object, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const body = (schema: object) => ({ required: true, content: { 'application/json': { schema } } });
const errors = (...codes: number[]) => Object.fromEntries(codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }]));
const pathParam = (name: string, description: string) => ({ name, in: 'path', required: true, schema: { type: 'string' }, description });
const queryParam = (name: string, schema: object, description?: string) => ({ name, in: 'query', required: false, schema, ...(description ? { description } : {}) });

const AGENT_OR_USER = [{ agentKey: [] }, { session: [] }];
const USER = [{ session: [] }];
const PUBLIC: object[] = [];

const schemas = {
  Error: obj({ success: { const: false }, error: obj({ message: str(), details: {} }, ['message']) }),
  Jwks: obj({ keys: arr(obj({ kty: { const: 'OKP' }, crv: { const: 'Ed25519' }, x: str('Public key, base64url'), kid: str(), alg: { const: 'EdDSA' }, use: { const: 'sig' } })) }),
  Health: obj(
    {
      ok: bool(),
      service: str(),
      valio: obj({ mode: { enum: ['live', 'simulator'] }, ok: bool(), status: int(), latencyMs: nullable(int()) }, ['mode', 'ok']),
      catalog: obj({ source: { enum: ['sample', 'valio-file'] }, products: int() }),
      signing: obj({ algorithm: { const: 'ed25519' }, kid: str() }),
      audit: obj({ head: nullable(str()) }),
      database: bool(),
      demoMode: bool(),
      time: dateTime,
    },
    ['ok', 'valio', 'catalog', 'signing']
  ),
  Product: obj({
    code: str('Valio product code'),
    name: str('English name (Finnish / Swedish when there is none)'),
    names: obj({ en: str(), fi: nullable(str()), sv: nullable(str()) }),
    brand: nullable(str()),
    category: str(),
    categoryId: nullable(str("Valio's numeric category code")),
    categoryCode: str('Semantic category derived from the names in the numeric category, e.g. dairy.milk, dry.pasta, other.<slug>'),
    group: str('Interchangeable-product group used for the substitute pool'),
    vendor: str(),
    origin: str(),
    temperatureClass: str(),
    salesUnit: obj({
      unit: str('Valio unit code, e.g. KI (case), ST (piece), KG'),
      contains: num('Litres or kg in one sales unit (1 when baseUnit is pcs)'),
      baseUnit: { enum: ['l', 'kg', 'pcs'], description: 'pcs = no litre / kg content known: order in pieces (sales units)' },
      measureSource: { enum: ['sample', 'unit', 'synkka', 'name', 'valio-price', 'none'] },
      variableWeight: bool(),
    }),
    packaging: obj({ perCase: int(), perPallet: nullable(int()) }),
    listPrice: obj({ amount: nullable(num('EUR per sales unit')), currency: { const: 'EUR' }, per: str(), perBaseUnit: nullable(num('EUR per l / kg')), source: { enum: ['live', 'simulator', 'unknown'] }, simulated: bool() }),
    nutritionPer100g: nullable({ type: 'object', additionalProperties: nullable(num()), description: 'Includes LACS (lactose g/100 g); null = no data' }),
    allergens: nullable(arr(str('GS1 code the product CONTAINS'))),
    allergenLabels: nullable(arr(str())),
    mayContain: nullable(arr(str('GS1 code it MAY_CONTAIN — exclusion rules treat it as present'))),
    valioSubstitutes: arr(str()),
    deliveryReliability: nullable(num('0–1; null = no data')),
    co2eKgPerKg: nullable(num()),
    sample: bool('Invented demo row (codes start with 9)'),
    flags: obj({ lactoseFree: nullable(bool()), autoSelectable: bool(), reason: str() }, ['lactoseFree', 'autoSelectable']),
  }),
  QuoteLine: obj({
    code: str(),
    name: str(),
    salesUnit: obj({ unit: str(), contains: num(), baseUnit: str() }),
    quantity: int('Sales units quoted (0 = price/stock only)'),
    unitPrice: num('EUR per sales unit, before tax'),
    lineTotal: num(),
    currency: { const: 'EUR' },
    priceWithTax: nullable(num()),
    taxPercent: nullable(num()),
    comparisonPrice: nullable(num()),
    comparisonUnit: nullable(str()),
    priceValidFrom: nullable(date),
    priceValidTo: nullable(date),
    salesBlock: nullable(str()),
    closingTime: nullable(str()),
    deliveries: arr(obj({ date, amount: num('Sales units'), salesUnit: str() })),
    availableByRequestedDate: num('Sales units deliverable on or before requestedDate'),
    earliestDelivery: nullable(date),
  }),
  Quote: obj(
    {
      id: str('qt_…'),
      issuer: { const: 'ai-mo-gateway' },
      kid: str('Signing key id, see GET /api/gw/keys'),
      supplier: { const: 'valio-aimo' },
      source: { enum: ['live', 'simulator'] },
      organizationId: str(),
      policy: nullable(obj({ key: str(), version: int() })),
      requestedDate: date,
      currency: { const: 'EUR' },
      lines: arr(ref('QuoteLine')),
      total: num(),
      issuedAt: dateTime,
      expiresAt: dateTime,
      signature: str('ed25519:<base64url> over the canonical JSON (sorted keys) of every other field'),
    },
    undefined,
    { description: 'Signed quote. To verify yourself: remove `signature`, serialise with sorted keys and no whitespace, verify with the Ed25519 JWK from /api/gw/keys.' }
  ),
  QuoteResult: obj({ quote: ref('Quote'), unknownCodes: arr(str()) }),
  QuoteVerification: obj({ quoteId: nullable(str()), valid: bool(), signatureValid: bool(), expired: bool(), expiresAt: nullable(dateTime), kid: nullable(str()), reason: nullable(str()) }),
  Check: obj({
    rule: str('Rule key, e.g. limit.perOrder, nutrition.LACS, stock.coverage'),
    passed: bool(),
    severity: { enum: ['hard', 'approval', 'info'] },
    title: str(),
    detail: str(),
    observed: {},
    limit: {},
  }),
  Candidate: obj({
    code: str(),
    name: str(),
    salesUnit: str(),
    unitPrice: num(),
    pricePerBase: num(),
    lacs: nullable(num()),
    reliability: num(),
    valioSubstitute: bool(),
    earliestDelivery: nullable(date),
    availableBase: num(),
    verdict: { enum: ['picked', 'eligible', 'blocked', 'missing_data', 'late', 'no_stock'] },
    reason: str(),
    score: num('0–1, display only; ranking follows the policy order'),
    rank: nullable(int()),
  }),
  RankResult: obj({
    policy: obj({ key: str(), version: int() }),
    requested: obj({ code: str(), name: str(), quantity: num(), unit: str(), availableByRequestedDate: num(), short: num(), requestedDate: date }),
    candidates: arr(ref('Candidate')),
    uncovered: num(),
    order: nullable(arr(str())),
  }),
  OrderLine: obj(
    {
      code: str(),
      name: str(),
      role: { enum: ['requested', 'substitute'] },
      substituteFor: str(),
      salesUnits: int(),
      salesUnit: str(),
      quantity: num('Base units (l / kg)'),
      unit: { enum: ['l', 'kg'] },
      unitPrice: num(),
      total: num(),
      deliveryDate: date,
      status: { enum: ['ordered', 'proposed', 'not_ordered', 'blocked'] },
      note: str(),
    },
    ['code', 'name', 'role', 'salesUnits', 'quantity', 'unit', 'unitPrice', 'total', 'status']
  ),
  Order: obj({
    id: str('VA-20458…'),
    title: str(),
    status: { enum: ['executed', 'pending_approval', 'partial', 'declined', 'blocked', 'expired'] },
    policy: obj({ id: str(), key: str(), version: int() }),
    agent: nullable(obj({ id: str(), name: str(), vendor: str(), model: str() }, ['id'])),
    request: { type: 'object', description: 'The request as received; automation orders carry automationId and trigger' },
    automationId: nullable(str('aut_… when an automation (standing order) placed this order')),
    requestedDate: date,
    deliveryDate: date,
    lines: arr(ref('OrderLine')),
    open: arr(obj({ code: str(), name: str(), quantity: num(), unit: str(), note: nullable(str()) })),
    total: num('Proposed total'),
    committedTotal: num('What was actually ordered (counts toward the weekly limit)'),
    quoteId: nullable(str()),
    checks: arr(ref('Check')),
    candidates: arr(ref('Candidate')),
    approval: nullable(obj({ id: str(), status: str(), approver: obj({ name: str(), role: str() }), expiresAt: dateTime, decidedBy: nullable(str()), decidedAt: nullable(dateTime) })),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  Approval: obj({
    id: str('apr_…'),
    orderId: str(),
    status: { enum: ['pending', 'approved', 'declined', 'partial', 'timed_out'] },
    approver: obj({ name: str(), role: str() }),
    reasons: arr(obj({ rule: str(), severity: str(), detail: str() })),
    proposal: nullable(obj({ lines: arr(ref('OrderLine')), total: num() })),
    fallback: obj({ lines: arr(ref('OrderLine')), total: num(), description: str() }),
    tradeoffs: arr(obj({ code: str(), substituteFor: str(), quantity: num(), unit: str(), costDelta: num(), fat: nullable(obj({ from: num(), to: num() })), summary: str() })),
    expiresAt: dateTime,
    decidedAt: nullable(dateTime),
    decidedBy: nullable(str()),
    decidedRole: nullable(str()),
    comment: nullable(str()),
    signature: nullable(str('ed25519 signature over the decision')),
    signatureShort: nullable(str()),
    createdAt: dateTime,
  }),
  ApprovalListItem: {
    allOf: [
      ref('Approval'),
      obj({
        order: obj({ id: str(), title: str(), status: str(), request: { type: 'object' }, deliveryDate: date, candidates: arr(ref('Candidate')), quoteId: nullable(str()), checks: arr(ref('Check')) }),
        agent: nullable(obj({ id: str(), name: str(), vendor: str() })),
      }),
    ],
  },
  AuditEntry: obj({
    seq: int(),
    id: str(),
    at: dateTime,
    orderId: nullable(str()),
    step: { enum: ['request', 'lookup', 'stock', 'substitutes', 'lactose', 'policy', 'approval', 'order', 'audit'] },
    status: { enum: ['auto', 'pending', 'blocked', 'skipped'] },
    actor: { enum: ['buyer-agent', 'gateway', 'valio-api', 'policy', 'head-chef'] },
    message: str(),
    payload: { type: 'object' },
    prevHash: str('64 hex; genesis = 64 zeros'),
    hash: str('sha256(canonicalJson({seq, at, orderId, step, status, actor, message, payload}) + prevHash)'),
  }),
  OrderResult: obj(
    {
      decision: { enum: ['execute', 'needs_approval', 'block'] },
      order: ref('Order'),
      checks: arr(ref('Check')),
      quote: nullable(ref('Quote')),
      approval: nullable(ref('Approval')),
      audit: arr(ref('AuditEntry')),
      idempotentReplay: bool(),
    },
    ['order', 'checks', 'quote', 'approval', 'audit']
  ),
  DecisionResult: obj({ approval: ref('Approval'), order: ref('Order'), audit: arr(ref('AuditEntry')) }),
  ChainVerification: obj({ ok: bool(), entries: int(), head: str(), headShort: str(), brokenAt: int(), reason: str() }, ['ok', 'entries', 'head']),
  PolicyRule: {
    description:
      'A typed rule in mandate.policy/v1. Unknown types fail closed (a person decides). Types: limit.perOrder, limit.perWeek, limit.perLine, category.allow, nutrition, allergen.exclude, product.attribute, delivery.days, data.missing, substitution, substitution.rank, approval.',
    anyOf: [
      obj(
        {
          key: str('e.g. product.attribute.origin'),
          type: { const: 'product.attribute' },
          attribute: str('origin | vendor | temperatureClass | deliveryReliability | co2eKgPerKg | pricePerBase | categoryCode | group | nutrition.<NUTRIENT>'),
          operator: { enum: ['=', '!=', '<', '<=', '>', '>=', 'in', 'not_in'] },
          value: { anyOf: [{ type: 'string' }, { type: 'number' }, arr(str())], description: 'Strings compare case-insensitively; categoryCode matches by prefix; pricePerBase = quoted price per l/kg (else catalog)' },
          scope: obj({ categories: arr(str('categoryCode prefix, e.g. dairy.cheese')), codes: arr(str('Product code')) }, []),
          hard: bool('true = block, false = needs approval'),
          onMissing: { enum: ['needs_approval', 'block', 'ignore'], description: 'Default needs_approval (fails closed)' },
          label: str(),
        },
        ['key', 'type', 'attribute', 'operator', 'value', 'hard']
      ),
      obj(
        {
          key: str('e.g. limit.perLine.dairy.cheese'),
          type: { const: 'limit.perLine' },
          max: num('Any single line above this triggers'),
          unit: { enum: ['l', 'kg', 'pcs', 'EUR'], description: 'Base units, sales units (pcs) or the line € total; lines in another base unit are not counted' },
          scope: obj({ categories: arr(str('categoryCode prefix, e.g. dairy.cheese')), codes: arr(str('Product code')) }, []),
          over: { enum: ['needs_approval', 'block'] },
        },
        ['key', 'type', 'max', 'unit', 'over']
      ),
      obj(
        { key: str('delivery.days'), type: { const: 'delivery.days' }, days: arr(int('ISO weekday 1 = Mon … 7 = Sun')), over: { enum: ['needs_approval', 'block'] } },
        ['key', 'type', 'days', 'over']
      ),
      { type: 'object', required: ['key', 'type'], properties: { key: str(), type: str(), hard: bool() }, additionalProperties: true, description: 'Any other rule type (see description)' },
    ],
  },
  RuleDraft: obj({
    rule: nullable(ref('PolicyRule')),
    sentence: str('describeRule(rule): plain-English one-liner ("" when unsupported)'),
    supported: bool('false when the sentence can\'t be expressed with the supported rule types'),
    compiler: { enum: ['gemini', 'rules'] },
    notes: arr(str()),
    warnings: arr(str()),
    ms: int('Server time spent'),
  }, ['rule', 'sentence', 'supported', 'compiler', 'notes', 'warnings']),
  PolicyDocument: obj({
    schema: { const: 'mandate.policy/v1' },
    id: str('Policy key'),
    name: str(),
    buyer: obj({ org: str(), unit: str() }),
    supplier: { const: 'valio-aimo' },
    version: int(),
    plain_language: str(),
    scope: obj({ applies_to: str(), per_product_rules: bool() }),
    rules: arr(ref('PolicyRule')),
    approvers: arr(obj({ name: str(), role: str(), window_minutes: int() })),
    on_violation: obj({ soft: str(), hard: str() }),
    on_timeout: str(),
  }),
  PolicyVersion: obj({
    id: str('Version row id'),
    key: str('pol_…'),
    name: str(),
    version: int(),
    status: { enum: ['draft', 'signed', 'superseded'] },
    plainLanguage: str(),
    summary: nullable(str()),
    rules: arr(ref('PolicyRule')),
    approver: nullable(obj({ name: str(), role: str(), windowMinutes: int(), fallback: str() })),
    document: ref('PolicyDocument'),
    signature: nullable(obj({ algorithm: str(), kid: str(), signedBy: str(), role: str(), signedAt: dateTime, value: str(), short: str(), valid: bool() })),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  Policy: {
    allOf: [
      ref('PolicyVersion'),
      obj({ activeVersion: nullable(int()), hasDraft: bool(), agents: arr(obj({ id: str(), name: str() })), versions: arr(ref('PolicyVersion')) }, ['activeVersion', 'hasDraft', 'agents']),
    ],
    description: 'Latest version of a policy (+ all versions on GET /policies/{id})',
  },
  Agent: obj({
    id: str(),
    name: str(),
    vendor: str(),
    model: str(),
    host: str(),
    transport: { enum: ['mcp', 'openapi'] },
    policy: obj({ key: str(), version: nullable(int()), name: nullable(str()) }),
    key: nullable(obj({ id: str(), start: nullable(str()), prefix: nullable(str()), enabled: nullable(bool()), createdAt: dateTime, lastRequest: nullable(dateTime), requestCount: nullable(int()) })),
    stats: obj({ ordersPlaced: int(), approvalsRequested: int(), blocked: int(), auditEntriesToday: int() }),
    createdAt: dateTime,
  }),
  AgentKey: obj({ agentId: str(), keyId: str(), key: str('Plaintext — shown once'), start: nullable(str()), prefix: nullable(str()), createdAt: dateTime, note: str() }),
  Stats: obj({
    week: obj({ ordersThisWeek: int(), byStatus: { type: 'object', additionalProperties: int() } }),
    autoApprovedShare: nullable(num('0–1 of decided orders this week that executed with no human')),
    spend: obj({ policyKey: nullable(str()), thisWeek: num(), demoReplays: num(), demoReplaySpend: num(), limitPerWeek: nullable(num()), limitPerOrder: nullable(num()), currency: { const: 'EUR' } }),
    pendingApprovals: int(),
    medianApprovalMinutes: nullable(num()),
    auditEntriesToday: int(),
    blockedThisWeek: int(),
  }),
};

const scheduleSchema = obj({
  days: arr({ type: 'integer', minimum: 1, maximum: 7, description: 'ISO weekday, 1 = Monday … 7 = Sunday' }),
  time: str('HH:MM, 24 h, Europe/Helsinki', { pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
  leadDays: { type: 'integer', minimum: 0, maximum: 14, description: 'Delivery date = run day (Helsinki) + leadDays' },
});
const automationLine = obj({ code: str('Valio product code'), quantity: num(), unit: { enum: ['l', 'kg', 'pcs'] } });
const automationWrite = (required: string[]) =>
  obj(
    {
      name: str(),
      description: nullable(str()),
      schedule: scheduleSchema,
      lines: arr(automationLine),
      agentId: str('Agent the automation runs as (default agt_gemini); its signed policy applies'),
      enabled: bool('Default true'),
      allowSubstitutes: bool('Default true'),
    },
    required
  );

Object.assign(schemas, {
  Schedule: scheduleSchema,
  Automation: obj({
    id: str('aut_…'),
    name: str('Also the title of every order it places'),
    description: nullable(str()),
    enabled: bool(),
    schedule: ref('Schedule'),
    scheduleLabel: str('e.g. "Every Mon & Thu at 06:00 · delivery next day"'),
    lines: arr(obj({ code: str(), name: str(), quantity: num(), unit: { enum: ['l', 'kg', 'pcs'] } })),
    allowSubstitutes: bool(),
    agent: obj({ id: str(), name: str() }),
    policy: obj({ key: nullable(str()), version: nullable(int('Signed version in force; null if none')), name: nullable(str()) }),
    lastRun: nullable(obj({ orderId: str(), status: str(), at: dateTime, total: num(), committedTotal: num() })),
    nextRunAt: nullable({ ...dateTime, description: 'Next scheduled slot; null when disabled' }),
    runsLast7Days: int('Orders placed by this automation in the last 7 days'),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
  ParseResult: obj({
    text: str(),
    lines: arr(
      obj(
        {
          code: str(),
          name: str(),
          quantity: num(),
          unit: { enum: ['l', 'kg', 'pcs'] },
          salesUnit: str('e.g. "carton (1 l)"'),
          salesUnits: int('Sales units this rounds up to'),
          matched: str('The phrase that was matched'),
          confidence: num('0–1'),
          alternatives: arr(obj({ code: str(), name: str() })),
        },
        ['code', 'name', 'quantity', 'unit', 'salesUnit', 'matched', 'confidence', 'alternatives']
      )
    ),
    requestedDate: nullable(date),
    dateText: nullable(str('The words that gave the date')),
    unmatched: arr(str('Item text that matched no product')),
    parser: { enum: ['gemini', 'rules'] },
    notes: arr(str()),
    rules: arr(
      obj(
        {
          rule: ref('PolicyRule'),
          sentence: str('The rule in plain words'),
          words: str('The words of the request it came from, e.g. "local only"'),
        },
        ['rule', 'sentence', 'words'],
        { description: 'A rule the words state (origin, lactose, allergens, spend limits) — never product words; a date is not a rule. Not saved anywhere.' }
      )
    ),
  }),
});

const orderBody = obj(
  {
    lines: arr(obj({ code: str('Valio product code'), quantity: num(), unit: { enum: ['l', 'kg', 'pcs'] } })),
    requestedDate: date,
    allowSubstitutes: bool('Default true'),
    note: str('Shown as the order title'),
    idempotencyKey: str('Same key → same order, no new audit entries'),
    agentId: str('Web UI (session) only: which agent acts. Ignored for agent keys.'),
  },
  ['lines', 'requestedDate'],
  { description: 'Unknown fields (e.g. a self-declared limit) are ignored and recorded as such in the audit log — the limits always come from the signed policy bound to the key.' }
);

const paths = {
  '/api/gw/health': { get: { tags: ['Gateway'], summary: 'Health, Valio connectivity (or simulator mode), signing key id, chain head', security: PUBLIC, responses: { 200: json(ref('Health')) } } },
  '/api/gw/keys': { get: { tags: ['Gateway'], summary: 'Gateway public signing key (JWKS)', security: PUBLIC, responses: { 200: json(ref('Jwks')) } } },
  '/api/gw/products': {
    get: {
      tags: ['Catalog'],
      summary: 'Search products',
      security: AGENT_OR_USER,
      parameters: [
        queryParam('q', { type: 'string' }, 'English / Finnish name words, brand or product code; ranked (phrase › all words › some); "lactose free" prefers LACS = 0'),
        queryParam('category', { type: 'string' }, 'Category name or code (dairy.milk)'),
        queryParam('lactoseFree', { enum: ['true', 'false'] }, 'LACS = 0'),
        queryParam('missingAllergens', { enum: ['true', 'false'] }),
        queryParam('hasSubstitute', { enum: ['true', 'false'] }),
        queryParam('limit', { type: 'integer' }, 'Page size (default 50, max 200)'),
        queryParam('offset', { type: 'integer' }),
      ],
      responses: { 200: json(obj({ products: arr(ref('Product')), total: int(), offset: int(), limit: int(), nextOffset: nullable(int()), categories: arr(obj({ code: str(), count: int() })), source: str() })), ...errors(400, 401) },
    },
  },
  '/api/gw/products/search': {
    post: {
      tags: ['Catalog'],
      summary: 'Search products (JSON body; same as search_products)',
      security: AGENT_OR_USER,
      requestBody: body(obj({ query: str(), category: str(), lactoseFree: bool(), missingAllergens: bool(), hasSubstitute: bool(), limit: int(), offset: int() }, [])),
      responses: { 200: json(obj({ products: arr(ref('Product')), total: int(), offset: int(), nextOffset: nullable(int()), source: str() })), ...errors(400, 401) },
    },
  },
  '/api/gw/products/{code}': { get: { tags: ['Catalog'], summary: 'One product', security: AGENT_OR_USER, parameters: [pathParam('code', 'Valio product code')], responses: { 200: json(ref('Product')), ...errors(401, 404) } } },
  '/api/gw/quotes': {
    post: {
      tags: ['Quotes'],
      summary: 'Signed quote: fixed prices + dated availability, valid 15 min',
      security: AGENT_OR_USER,
      requestBody: body(obj({ products: arr(obj({ code: str(), quantity: num('Sales units, or l / kg / pcs when unit is given'), unit: { enum: ['l', 'kg', 'pcs'] } }, ['code'])), requestedDate: date })),
      responses: { 201: json(ref('QuoteResult')), ...errors(400, 401, 422) },
    },
  },
  '/api/gw/quotes/{id}': { get: { tags: ['Quotes'], summary: 'A stored quote with its verification', security: AGENT_OR_USER, parameters: [pathParam('id', 'qt_…')], responses: { 200: json(obj({ quote: ref('Quote'), verification: ref('QuoteVerification') })), ...errors(401, 404) } } },
  '/api/gw/quotes/verify': {
    post: {
      tags: ['Quotes'],
      summary: 'Verify a quote signature and expiry (public)',
      security: PUBLIC,
      requestBody: body({ oneOf: [obj({ quote: ref('Quote') }), obj({ id: str('qt_…') })] }),
      responses: { 200: json(ref('QuoteVerification')), ...errors(400, 404) },
    },
  },
  '/api/gw/substitutes/rank': {
    post: {
      tags: ['Quotes'],
      summary: 'Rank substitutes under the bound policy (read-only)',
      security: AGENT_OR_USER,
      requestBody: body(obj({ code: str(), quantity: num(), unit: { enum: ['l', 'kg', 'pcs'] }, requestedDate: date, agentId: str('Session only') }, ['code', 'quantity', 'unit', 'requestedDate'])),
      responses: { 200: json(ref('RankResult')), ...errors(400, 401, 404, 409, 422) },
    },
  },
  '/api/gw/orders': {
    post: {
      tags: ['Orders'],
      summary: 'Place an order — executed, pending_approval (with reasons) or blocked',
      security: AGENT_OR_USER,
      requestBody: body(orderBody),
      responses: { 201: json(ref('OrderResult'), 'Order processed (see order.status)'), 200: json(ref('OrderResult'), 'Idempotent replay'), ...errors(400, 401, 409, 422) },
    },
    get: {
      tags: ['Orders'],
      summary: 'List orders (agent keys see their own)',
      security: AGENT_OR_USER,
      parameters: [queryParam('status', { enum: ['executed', 'pending_approval', 'partial', 'declined', 'blocked', 'expired'] }), queryParam('agentId', { type: 'string' }), queryParam('automationId', { type: 'string' }, 'Only orders placed by this automation'), queryParam('limit', { type: 'integer' })],
      responses: { 200: json(obj({ orders: arr(ref('Order')) })), ...errors(400, 401) },
    },
  },
  '/api/gw/policies/{id}/draft': {
    delete: {
      tags: ['Policies'],
      summary: 'Discard the unsigned draft of a policy (agents keep using the signed version)',
      security: USER,
      parameters: [pathParam('id', 'Policy id or key')],
      responses: { 200: json(ref('Policy')), ...errors(401, 403, 404, 409) },
    },
  },
  '/api/gw/orders/preview': {
    post: {
      tags: ['Orders'],
      summary: 'Dry run: what would happen if this order were placed now (real signed quote + policy checks; nothing ordered or logged)',
      description: 'Signed-in users may pass `policyId` to test an unsigned draft policy version; agent keys always use their bound, signed policy.',
      security: AGENT_OR_USER,
      requestBody: body({ ...orderBody, properties: { ...(orderBody as any).properties, policyId: str('Session only: policy version to test (e.g. a draft)') } }),
      responses: {
        200: json(
          obj({
            preview: { const: true },
            decision: { enum: ['execute', 'needs_approval', 'block'] },
            checks: arr(ref('Check')),
            quote: ref('Quote'),
            candidates: arr(obj({})),
            lines: arr(obj({})),
            open: arr(obj({})),
            total: num(),
            suggestedDate: nullable(date),
            steps: arr(ref('AuditEntry')),
          })
        ),
        ...errors(400, 401, 422),
      },
    },
  },
  '/api/gw/orders/{id}': {
    get: {
      tags: ['Orders'],
      summary: 'Order with quote, approval and audit entries',
      security: AGENT_OR_USER,
      parameters: [pathParam('id', 'VA-…')],
      responses: { 200: json(obj({ order: ref('Order'), checks: arr(ref('Check')), quote: nullable(ref('Quote')), approval: nullable(ref('Approval')), audit: arr(ref('AuditEntry')) })), ...errors(401, 404) },
    },
  },
  '/api/gw/approvals': {
    get: {
      tags: ['Approvals'],
      summary: 'Approvals (inbox)',
      security: AGENT_OR_USER,
      parameters: [queryParam('status', { enum: ['pending', 'approved', 'declined', 'partial', 'timed_out'] })],
      responses: { 200: json(obj({ approvals: arr(ref('ApprovalListItem')) })), ...errors(400, 401) },
    },
  },
  '/api/gw/approvals/{id}/decide': {
    post: {
      tags: ['Approvals'],
      summary: 'Approve, decline or approve only the policy-allowed part (signed-in person)',
      security: USER,
      parameters: [pathParam('id', 'apr_…')],
      requestBody: body(obj({ decision: { enum: ['approve', 'decline', 'partial'] }, comment: str() }, ['decision'])),
      responses: { 200: json(ref('DecisionResult')), ...errors(400, 401, 403, 404, 409) },
    },
  },
  '/api/gw/approvals/{id}/expire': {
    post: { tags: ['Demo'], summary: 'DEMO_MODE only: time the approval out now (applies the fallback)', security: USER, parameters: [pathParam('id', 'apr_…')], responses: { 200: json(ref('DecisionResult')), ...errors(401, 404, 409) } },
  },
  '/api/gw/audit': {
    get: {
      tags: ['Audit'],
      summary: 'Audit entries, newest first',
      security: AGENT_OR_USER,
      parameters: [queryParam('orderId', { type: 'string' }), queryParam('limit', { type: 'integer' }), queryParam('before', { type: 'integer' }, 'Entries with seq < before (paging)')],
      responses: { 200: json(obj({ entries: arr(ref('AuditEntry')), nextBefore: nullable(int()) })), ...errors(400, 401) },
    },
  },
  '/api/gw/audit/verify': { get: { tags: ['Audit'], summary: 'Recompute the whole hash chain server-side', security: AGENT_OR_USER, responses: { 200: json(ref('ChainVerification')), ...errors(401) } } },
  '/api/gw/stats': { get: { tags: ['Orders'], summary: 'Dashboard KPIs', security: AGENT_OR_USER, parameters: [queryParam('policy', { type: 'string' }, 'Policy key for spend/limit')], responses: { 200: json(ref('Stats')), ...errors(401) } } },
  '/api/gw/policy': {
    get: {
      tags: ['Policies'],
      summary: 'The signed policy the calling agent is bound to',
      security: AGENT_OR_USER,
      parameters: [queryParam('agentId', { type: 'string' }, 'Session only')],
      responses: { 200: json(obj({ agent: obj({ id: str(), name: str() }), policy: ref('PolicyVersion') })), ...errors(401, 404, 409) },
    },
  },
  '/api/gw/policies': {
    get: { tags: ['Policies'], summary: 'Policies (latest version of each)', security: AGENT_OR_USER, responses: { 200: json(obj({ policies: arr(ref('Policy')) })), ...errors(401) } },
    post: {
      tags: ['Policies'],
      summary: 'New draft policy',
      security: USER,
      requestBody: body(obj({ name: str(), plainLanguage: str(), key: str('pol_… (default from name)') }, ['name', 'plainLanguage'])),
      responses: { 201: json(ref('Policy')), ...errors(400, 401, 409) },
    },
  },
  '/api/gw/policies/{id}': {
    get: { tags: ['Policies'], summary: 'Policy with all versions', security: AGENT_OR_USER, parameters: [pathParam('id', 'Policy key or version id')], responses: { 200: json(ref('Policy')), ...errors(401, 404) } },
    patch: {
      tags: ['Policies'],
      summary: 'Edit the draft (editing a signed policy creates a new draft version)',
      security: USER,
      parameters: [pathParam('id', 'Policy key or version id')],
      requestBody: body(obj({ name: str(), plainLanguage: str(), summary: str(), rules: arr(ref('PolicyRule')) }, [])),
      responses: { 200: json(ref('Policy')), ...errors(400, 401, 404, 422) },
    },
  },
  '/api/gw/policies/{id}/compile': {
    post: {
      tags: ['Policies'],
      summary: 'Compile the draft’s plain language into rules (Gemini when GEMINI_API_KEY is set, otherwise the rule-based parser)',
      security: USER,
      parameters: [pathParam('id', 'Policy key or version id')],
      responses: { 200: json(obj({ policy: ref('Policy'), compiler: { enum: ['gemini', 'rules'] }, intent: { type: 'object' }, note: str() }, ['policy', 'compiler', 'intent'])), ...errors(401, 404) },
    },
  },
  '/api/gw/policies/{id}/rules/draft': {
    post: {
      tags: ['Policies'],
      summary: 'Draft ONE rule from ONE sentence (not saved — insert it into the draft rules and PATCH the policy)',
      description:
        'Gemini (when GEMINI_API_KEY is set) fills a strict form limited to the supported rule types; the result is validated server-side (type, attribute, operator, value types, known categories/codes/allergens) and gets a key that does not clash with the policy (or the optional `rules` you pass). Falls back to a rule-based parser. Unsupported sentences return supported: false, rule: null and a note listing what is possible.',
      security: USER,
      parameters: [pathParam('id', 'Policy key or version id')],
      requestBody: body(obj({ text: str('One sentence, e.g. "Nothing from outside Finland"'), rules: arr(ref('PolicyRule')) }, ['text'])),
      responses: { 200: json(ref('RuleDraft')), ...errors(400, 401, 404) },
    },
  },
  '/api/gw/policies/{id}/sign': {
    post: {
      tags: ['Policies'],
      summary: 'Sign the draft (supersedes the previous signed version)',
      security: USER,
      parameters: [pathParam('id', 'Policy key or version id')],
      requestBody: { required: false, content: { 'application/json': { schema: obj({ role: str('Signer role, default from the directory'), summary: str('What changed') }, []) } } },
      responses: { 200: json(ref('Policy')), ...errors(401, 404, 409, 422) },
    },
  },
  '/api/gw/agents': { get: { tags: ['Agents'], summary: 'Agents with bound policy, key info and usage', security: AGENT_OR_USER, responses: { 200: json(obj({ agents: arr(ref('Agent')) })), ...errors(401) } } },
  '/api/gw/agents/{id}/keys': {
    post: { tags: ['Agents'], summary: 'Issue a new API key for the agent (revokes the old one; plaintext returned once)', security: USER, parameters: [pathParam('id', 'agt_…')], responses: { 201: json(ref('AgentKey')), ...errors(401, 404) } },
  },
  '/api/gw/agents/{id}/keys/{keyId}': {
    delete: { tags: ['Agents'], summary: 'Revoke the agent’s key', security: USER, parameters: [pathParam('id', 'agt_…'), pathParam('keyId', 'Key id')], responses: { 204: { description: 'Revoked' }, ...errors(401, 404) } },
  },
  '/api/gw/automations': {
    get: { tags: ['Automations'], summary: 'Standing orders (agent keys see the ones that run as them)', security: AGENT_OR_USER, responses: { 200: json(obj({ automations: arr(ref('Automation')) })), ...errors(401) } },
    post: {
      tags: ['Automations'],
      summary: 'Create a standing order, placed by the gateway on schedule as the agent (real orders, under its signed policy)',
      security: USER,
      requestBody: body(automationWrite(['name', 'schedule', 'lines'])),
      responses: { 201: json(ref('Automation'), 'Created'), ...errors(400, 401, 404, 422) },
    },
  },
  '/api/gw/automations/{id}': {
    get: { tags: ['Automations'], summary: 'One automation', security: AGENT_OR_USER, parameters: [pathParam('id', 'aut_…')], responses: { 200: json(ref('Automation')), ...errors(401, 404) } },
    patch: {
      tags: ['Automations'],
      summary: 'Change name, schedule (partial), lines, enabled or substitutes; schedule changes recompute nextRunAt',
      security: USER,
      parameters: [pathParam('id', 'aut_…')],
      requestBody: body({ ...automationWrite([]), properties: { ...automationWrite([]).properties, schedule: { ...scheduleSchema, required: [] } } }),
      responses: { 200: json(ref('Automation')), ...errors(400, 401, 404, 422) },
    },
    delete: { tags: ['Automations'], summary: 'Delete (past orders keep their automationId)', security: USER, parameters: [pathParam('id', 'aut_…')], responses: { 204: { description: 'Deleted' }, ...errors(401, 404) } },
  },
  '/api/gw/automations/{id}/run': {
    post: {
      tags: ['Automations'],
      summary: 'Run now (enabled or not): a real order for today + leadDays (Helsinki); the schedule does not move',
      security: AGENT_OR_USER,
      parameters: [pathParam('id', 'aut_…')],
      responses: { 201: json({ allOf: [ref('OrderResult'), obj({ automationId: str() })] }), ...errors(401, 404, 409, 422) },
    },
  },
  '/api/gw/requests/parse': {
    post: {
      tags: ['Orders'],
      summary: 'Plain language → draft order lines matched against the catalog, a delivery date (Helsinki) and the rules the words state. Never places an order.',
      description:
        'Rule-based parser; with GEMINI_API_KEY set Gemini splits the text into product phrases, quantities, the date and rule words, and products are still resolved against this catalog and rules still come from the rule-based phrase parser (falls back to the rules on error). "20 kg pasta, local only" → one line + one rule (origin = FI); product matching prefers products that meet the rules. Also the MCP tool parse_request.',
      security: AGENT_OR_USER,
      requestBody: body(obj({ text: str('e.g. "1,000 l lactose-free milk for Monday"'), agentId: str('Session only') }, ['text'])),
      responses: { 200: json(ref('ParseResult')), ...errors(400, 401, 404) },
    },
  },
  '/api/gw/demo/run': {
    post: {
      tags: ['Demo'],
      summary: 'DEMO_MODE only: run a scenario through the real orchestration as the Gemini buyer agent',
      security: AGENT_OR_USER,
      requestBody: body(obj({ scenario: { enum: ['routine', 'stockout', 'timeout'] } })),
      responses: { 201: json({ allOf: [ref('OrderResult'), obj({ scenario: str() })] }), ...errors(400, 401, 404) },
    },
  },
  '/api/gw/sandbox': {
    get: {
      tags: ['Sandbox'],
      summary: 'Judge sandbox info for the signed-in person’s org ({ sandbox: false } for normal orgs)',
      description: 'Sign in as judge@mandate.dev to get an org of your own with a policy that starts empty (rules come from your requests or are added by hand; approvals go to you) and two agents. Issue a key, point your MCP client at /mcp or call the REST API with x-api-key.',
      security: USER,
      responses: {
        200: json({
          oneOf: [
            obj({ sandbox: { const: false } }),
            obj({
              sandbox: { const: true },
              org: obj({ id: str(), name: str() }),
              policy: obj({ key: str(), version: nullable(int()) }),
              agents: arr(obj({ id: str(), name: str() })),
              resetAt: nullable(str('Show audit entries from this instant on (the chain is global and never trimmed)', { format: 'date-time' })),
              mcpUrl: str(),
              openapiUrl: str(),
            }),
          ],
        }),
        ...errors(401, 403),
      },
    },
  },
  '/api/gw/sandbox/key': {
    post: {
      tags: ['Sandbox'],
      summary: 'Issue a fresh API key for a sandbox agent (revokes its previous key; plaintext returned once)',
      security: USER,
      requestBody: body(obj({ agentId: str('agt_sandbox-…') })),
      responses: { 201: json(obj({ agentId: str(), key: str('mk_live_…'), start: nullable(str()) })), ...errors(400, 401, 403, 404) },
    },
  },
  '/api/gw/sandbox/reset': {
    post: {
      tags: ['Sandbox'],
      summary: 'Reset the sandbox: delete its orders, approvals, quotes, automations and policy versions; sign a fresh, empty policy v1 (no rules — only the approval route to you); re-issue agent keys',
      description: 'Audit entries are never deleted (one global hash chain): one entry "Sandbox reset by <name>" is appended and resetAt is recorded so clients show only later entries.',
      security: USER,
      responses: {
        200: json(
          obj({
            reset: { const: true },
            resetAt: dateTime,
            deleted: obj({ approvals: int(), orders: int(), quotes: int(), automations: int(), policies: int() }),
            policy: obj({ key: str(), version: int() }),
            keys: arr(obj({ agentId: str(), name: str(), key: str('Shown once'), start: nullable(str()) })),
            auditSeq: int(),
          })
        ),
        ...errors(401, 403, 409),
      },
    },
  },
};

export const openApiDocument = () => ({
  openapi: '3.1.0',
  info: {
    title: 'AI-MO — trusted trade gateway for Valio Aimo',
    version: '1.0.0',
    description:
      'Outside AI purchasing agents order from Valio Aimo through this gateway, which enforces the buyer’s signed purchasing policy on every order. ' +
      'Inside the rules it executes; outside them it returns pending_approval with the exact reasons and waits for the named approver; hard rules block. ' +
      'Prices are fixed. Quotes are Ed25519-signed and valid 15 minutes. Every step is appended to one hash-chained audit log. ' +
      'Automations (standing orders) are placed by the gateway itself on a Europe/Helsinki schedule through the same policy checks. ' +
      'Also available as an MCP server (Streamable HTTP) at /mcp with the same x-api-key.',
  },
  servers: [{ url: '/' }],
  security: AGENT_OR_USER,
  tags: ['Gateway', 'Catalog', 'Quotes', 'Orders', 'Approvals', 'Audit', 'Policies', 'Agents', 'Automations', 'Demo', 'Sandbox'].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: {
      agentKey: { type: 'apiKey', in: 'header', name: 'x-api-key', description: 'Agent key (mk_live_…). Binds the caller to an organization and a signed policy.' },
      session: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token', description: 'Web UI session (people).' },
    },
    schemas,
    responses: Object.fromEntries(
      [
        [400, 'Validation failed'],
        [401, 'Missing or invalid credentials'],
        [403, 'Not allowed for this caller'],
        [404, 'Not found'],
        [409, 'Conflict (e.g. no signed policy, approval already decided)'],
        [422, 'Unprocessable (e.g. unit mismatch, date in the past)'],
      ].map(([code, description]) => [`E${code}`, json(ref('Error'), description as string)])
    ),
  },
});
