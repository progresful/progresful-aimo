// Static definition of the playbook graph: steps, positions and edges. The
// server writes audit entries with exactly these step ids, so a run (or any
// past order) replays onto this graph from its real audit trail.
import type { IconType } from 'react-icons';
import type { Actor, Scenario } from '@/api/gateway';

export type StepKind = 'trigger' | 'valio' | 'rule' | 'rank' | 'policy' | 'human' | 'action' | 'audit';
export type StepStatus = 'idle' | 'running' | 'auto' | 'pending' | 'blocked' | 'skipped';

export type PlaybookStep = {
  id: string;
  kind: StepKind;
  title: string;
  subtitle: string;
  description: string;
  position: { x: number; y: number };
  // Decision steps get a second, downward exit for the exception lane.
  branches?: { ok: string; alt: string };
  /** Graphs built from a policy (playbook editor): own icon, and the rule as a plain sentence. */
  icon?: IconType;
  sentence?: string;
};

export type PlaybookEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: 'ok' | 'alt';
  targetHandle?: 'left' | 'top' | 'bottom';
  label?: string;
};

// Two lanes: the happy path on top, exceptions underneath. Exception steps sit
// between main-lane columns so a branch drops straight down into them.
const LANE_MAIN = 0;
const LANE_EXCEPTION = 190;

export const steps: PlaybookStep[] = [
  {
    id: 'request',
    kind: 'trigger',
    title: 'Order request',
    subtitle: 'from buyer agent',
    description: 'The buyer agent submits what the kitchen needs, with the signed policy attached. The gateway never trusts limits the agent sends — it loads the policy by its signature.',
    position: { x: 0, y: LANE_MAIN },
  },
  {
    id: 'lookup',
    kind: 'valio',
    title: 'Price & availability',
    subtitle: 'signed quote from Valio',
    description: 'Fixed list prices and dated delivery lines from Valio Aimo, returned as a signed quote valid for 15 minutes. No negotiation.',
    position: { x: 240, y: LANE_MAIN },
  },
  {
    id: 'stock',
    kind: 'valio',
    title: 'Stock & delivery',
    subtitle: 'covers qty by delivery date?',
    description: 'Converts the request into sales units and checks every delivery line against the requested date. A shortfall branches into the exception lane.',
    position: { x: 480, y: LANE_MAIN },
    branches: { ok: 'Covered', alt: 'Short' },
  },
  {
    id: 'substitutes',
    kind: 'rank',
    title: 'Rank substitutes',
    subtitle: 'Valio subs → reliability → price',
    description: 'Ranks candidates good → best: Valio-defined substitutes first, then delivery reliability (0–1), then price per litre. Delivery date must still be met.',
    position: { x: 526, y: LANE_EXCEPTION },
  },
  {
    id: 'lactose',
    kind: 'rule',
    title: 'Lactose rule',
    subtitle: 'always · lactose-free only',
    description: 'Hard rule from the policy. Lactose-free is read from the LACS nutrition value, not allergen codes (lactose-free milk is still tagged AM). Missing data fails closed: a person decides.',
    position: { x: 766, y: LANE_EXCEPTION },
  },
  {
    id: 'policy',
    kind: 'policy',
    title: 'Policy check',
    subtitle: 'limits · categories',
    description: 'The gateway evaluates the order against the signed policy: spend per order and per week, allowed categories and who approves what. Inside the rules it executes; outside them it pauses with the exact reason.',
    position: { x: 1000, y: LANE_MAIN },
    branches: { ok: 'Within limits', alt: 'Needs sign-off' },
  },
  {
    id: 'approval',
    kind: 'human',
    title: 'Head chef approval',
    subtitle: 'named approver · 30 min',
    description: 'The named approver sees what was asked, what is proposed, the trade-off and the cost — and decides. No answer within the window falls back to ordering only what the policy allows.',
    position: { x: 1046, y: LANE_EXCEPTION },
  },
  {
    id: 'order',
    kind: 'action',
    title: 'Place order',
    subtitle: 'at quoted, fixed prices',
    description: 'Places the order against the still-valid signed quote. Prices cannot change between quote and order.',
    position: { x: 1300, y: LANE_MAIN },
  },
  {
    id: 'audit',
    kind: 'audit',
    title: 'Audit trail',
    subtitle: 'shared with Valio',
    description: 'Every request, quote, decision and approval is appended to one hash-chained log that the buyer and Valio both see, and that replays onto this graph.',
    position: { x: 1540, y: LANE_MAIN },
  },
];

export const edges: PlaybookEdge[] = [
  { id: 'e-request-lookup', source: 'request', target: 'lookup' },
  { id: 'e-lookup-stock', source: 'lookup', target: 'stock' },
  { id: 'e-stock-policy', source: 'stock', target: 'policy', sourceHandle: 'ok', label: 'Covered' },
  { id: 'e-stock-substitutes', source: 'stock', target: 'substitutes', sourceHandle: 'alt', targetHandle: 'top', label: 'Short' },
  { id: 'e-substitutes-lactose', source: 'substitutes', target: 'lactose' },
  { id: 'e-lactose-policy', source: 'lactose', target: 'policy', targetHandle: 'bottom' },
  { id: 'e-policy-order', source: 'policy', target: 'order', sourceHandle: 'ok', label: 'Within limits' },
  { id: 'e-policy-approval', source: 'policy', target: 'approval', sourceHandle: 'alt', targetHandle: 'top', label: 'Needs sign-off' },
  { id: 'e-approval-order', source: 'approval', target: 'order', targetHandle: 'bottom' },
  { id: 'e-order-audit', source: 'order', target: 'audit' },
];

export const actorLabel: Record<Actor, string> = {
  'buyer-agent': 'Buyer agent',
  gateway: 'Gateway',
  'valio-api': 'Valio API',
  policy: 'Policy',
  'head-chef': 'Head chef',
};

/** UI copy for the three demo scenarios the gateway can run (POST /api/gw/demo/run). */
export const scenarios: { id: Scenario; name: string; summary: string; request: string }[] = [
  {
    id: 'stockout',
    name: 'Stock-out',
    summary: 'Short on Monday → lactose-safe substitute → over budget → head chef signs off',
    request: '1,000 l lactose-free milk for Monday',
  },
  {
    id: 'routine',
    name: 'Routine order',
    summary: 'Standing weekly order inside every rule — executes with no human involved',
    request: '400 l lactose-free milk for Monday',
  },
  {
    id: 'timeout',
    name: 'Approval timeout',
    summary: 'Nobody answers within the window → only the in-stock part is ordered',
    request: '1,000 l lactose-free milk for Monday',
  },
];

/** The policy the demo agents are bound to. */
export const BOUND_POLICY_KEY = 'pol_hospital-ward-dairy';

export const eur = (n: number, digits = 2) => `€${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Helsinki wall-clock time, with milliseconds for the audit trail. */
export const hkiTime = (iso: string, ms = false) => {
  const d = new Date(iso);
  const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Helsinki' });
  return ms ? `${t}.${String(d.getMilliseconds()).padStart(3, '0')}` : t;
};

/** "Mon 16 Nov" for a YYYY-MM-DD day or ISO timestamp. */
export const fmtDay = (day: string) =>
  new Date(day.length === 10 ? `${day}T12:00:00Z` : day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Helsinki' }).replace(',', '');

export const shortHash = (hash: string) => (hash.length > 12 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash);

/** "ed25519:AbCd…WxYz" for long signatures. */
export const shortSig = (sig: string) => {
  const [alg, value] = sig.includes(':') ? sig.split(':', 2) : ['', sig];
  const s = value.length > 14 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
  return alg ? `${alg}:${s}` : s;
};

/** Notes the demo scenarios attach to their orders (server: gateway.demo.ts). */
export const isScenarioNote = (note?: string | null) => !!note && /^(Standing weekly milk|Stock-out)/.test(note);

/** The person's own words, when the order came from the Home composer. */
export const composerText = (order: { automationId?: string | null; request: { note?: string } }) =>
  !order.automationId && order.request.note && !isScenarioNote(order.request.note) ? order.request.note : null;
