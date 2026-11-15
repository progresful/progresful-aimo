import type { PolicyDocument, RuleProduct } from '../policy.engine.ts';

// The demo policy and products, hand-built so the engine tests need no I/O.

export const dairyPolicy: PolicyDocument = {
  schema: 'mandate.policy/v1',
  id: 'pol_hospital-ward-dairy',
  name: 'Ward 4 kitchen — dairy',
  buyer: { org: 'Helsinki University Hospital', unit: 'Ward 4 kitchen' },
  supplier: 'valio-aimo',
  version: 3,
  plain_language: 'Order dairy for the ward kitchen. Everything must be lactose-free. Auto-order up to €1,200 per order and €6,000 a week; anything above, or any substitute, goes to the head chef.',
  scope: { applies_to: 'categories_and_attributes', per_product_rules: false },
  rules: [
    { key: 'limit.perOrder', type: 'limit.perOrder', max: 1200, currency: 'EUR', over: 'needs_approval' },
    { key: 'limit.perWeek', type: 'limit.perWeek', max: 6000, currency: 'EUR', window: 'iso_week', over: 'needs_approval' },
    { key: 'category.allow', type: 'category.allow', allow: ['dairy.milk', 'dairy.yoghurt', 'dairy.cheese', 'dairy.butter', 'dairy.cream'] },
    { key: 'nutrition.LACS', type: 'nutrition', hard: true, nutrient: 'LACS', operator: '=', value: 0, unit: 'g/100g' },
    { key: 'data.missing', type: 'data.missing', onMissing: 'needs_approval', fields: ['nutrition.LACS', 'allergens'] },
    { key: 'substitution.requiresApproval', type: 'substitution', requiresApproval: true },
    { key: 'substitution.rank', type: 'substitution.rank', order: ['valio_substitute', 'delivery_reliability', 'unit_price'], mustMeetDeliveryDate: true },
    { key: 'approval.route', type: 'approval', approver: { name: 'Mikko Laine', role: 'Head chef' }, windowMinutes: 30, onTimeout: 'order_policy_allowed_part' },
  ],
  approvers: [{ name: 'Mikko Laine', role: 'Head chef', window_minutes: 30 }],
  on_violation: { soft: 'pause_pending_approval', hard: 'reject_with_reason' },
  on_timeout: 'order_policy_allowed_part',
};

const milk = (code: string, name: string, price: number, lacs: number | null, reliability: number, size = 1, substitutes: string[] = []): RuleProduct => ({
  code,
  name,
  categoryCode: 'dairy.milk',
  salesUnit: { name: size === 1 ? 'carton' : 'box', size, base: 'l' },
  price,
  lacs,
  nutrition: { fat: 1.5 },
  allergens: [{ code: 'AM' }],
  substitutes,
  reliability,
});

export const P = {
  eila: milk('464398', 'Valio Eila semi skimmed 1 l UHT lactose free', 1.39, 0, 0.94, 1, ['463335']),
  eila3: milk('463335', 'Valio Eila 3 % 1 l lactose free', 1.62, 0, 0.97),
  eilaBox: milk('463038', 'Valio Eila semi skimmed 10 l box lactose free', 12.1, 0, 0.88, 10),
  regular: milk('463359', 'Valio semi skimmed milk 1 l', 1.09, 4.8, 0.99),
  buttermilk: { ...milk('901657', 'Valio buttermilk 1 l', 1.15, null, 0.92), allergens: null },
  oat: { ...milk('901451', 'Oddlygood barista oat drink 1 l', 2.35, 0, 0.97), categoryCode: 'plant.drinks' },
};

export const products = new Map(Object.values(P).map((p) => [p.code, p as RuleProduct]));
