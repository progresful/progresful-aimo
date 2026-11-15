// The "Try it yourself" challenges. Each one opens the real UI with something
// prefilled — the order workspace, the agents page — never a mock.
import type { ChallengeId } from './progress';

export type Challenge = {
  id: ChallengeId;
  title: string;
  /** What to try, one line. */
  tryText: string;
  /** What should happen, one line. */
  expect: string;
  action: string;
};

export const CHALLENGES: Challenge[] = [
  {
    id: 'within',
    title: 'Order something within the rules',
    tryText: '400 l lactose-free milk for Monday — then place it.',
    expect: 'Every check is green, so the gateway orders it on its own. Nobody is asked.',
    action: 'Try it',
  },
  {
    id: 'lactose',
    title: 'Break the lactose rule',
    tryText: '200 l Valio semi skimmed milk (463359) for Monday — then add the rule “lactose-free only”.',
    expect:
      'The gateway blocks it — lactose comes from the LACS nutrient (4.8 g/100 g), not allergen codes — and offers a lactose-free substitute instead.',
    action: 'Try it',
  },
  {
    id: 'budget',
    title: 'Go over budget and approve it yourself',
    tryText: '1,000 l lactose-free milk for Monday, ask me if over €1,000 — place it, then approve it.',
    expect:
      'Your words become a per-order limit; the order is over it, so it stops at the approval step and waits for the named approver. That’s you: approve it right there.',
    action: 'Try it',
  },
  {
    id: 'rule',
    title: 'Write your own rule',
    tryText: '“No single line over 200 litres without approval”, in your own words — with a 300 l order open.',
    expect: 'It becomes a rule on the graph, and the order’s verdict changes from ✓ to “needs approval”. It takes effect at once, signed by you — Undo is one click.',
    action: 'Try it',
  },
  {
    id: 'catalog',
    title: 'Order anything from the real Valio catalog',
    tryText: 'Try butter, cream, cheese, coffee… — 17,546 real products.',
    expect: 'Real codes, units and live Valio prices. Products without allergen data always go to a person.',
    action: 'Start empty',
  },
  {
    id: 'agent',
    title: 'Connect your own AI agent',
    tryText: 'Get a sandbox key and point any MCP client — or curl — at the gateway.',
    expect: 'Your agent gets the same signed rules. It can read the policy, never change it.',
    action: 'Get a key',
  },
];

const HKI = 'Europe/Helsinki';

/** The next Monday after today, Helsinki time (YYYY-MM-DD). */
export const nextMonday = (now = Date.now()) => {
  const today = new Date(new Date(now).toLocaleDateString('sv-SE', { timeZone: HKI }) + 'T12:00:00Z');
  const dow = today.getUTCDay(); // 0 = Sun … 6 = Sat
  const add = (8 - dow) % 7 || 7;
  return new Date(today.getTime() + add * 864e5).toISOString().slice(0, 10);
};

/** The real Valio 1 l semi skimmed milk — LACS 4.8, so the lactose rule blocks it. */
export const LACTOSE_CODE = '463359';
export const RULE_EXAMPLE = 'No single line over 200 litres without approval';

const workspace = (params: Record<string, string>) => `/app/new?${new URLSearchParams(params).toString()}`;

/** Where each challenge's one-click action goes. */
export const challengeLink = (id: ChallengeId): string => {
  switch (id) {
    case 'within':
      return workspace({ text: '400 l lactose-free milk for Monday', try: id });
    case 'lactose':
      // The parser tends to pick the lactose-free twin for "semi skimmed milk": prefill the line by code.
      // The sandbox starts with no rules: "Add a rule" opens with the lactose rule filled in.
      return workspace({ text: '200 l Valio semi skimmed milk for Monday', line: `${LACTOSE_CODE}:200:l`, date: nextMonday(), describe: 'Lactose-free only', try: id });
    case 'budget':
      return workspace({ text: '1,000 l lactose-free milk for Monday, ask me if over €1,000', try: id });
    case 'rule':
      // A line over 200 l that passes today, with "Add a rule" open: the new rule changes its verdict.
      return workspace({ text: '300 l lactose-free milk for Monday', describe: RULE_EXAMPLE, try: id });
    case 'catalog':
      return workspace({ date: nextMonday(), try: id });
    case 'agent':
      return '/app/agents?try=agent#sandbox-key';
  }
};

/** The strip shown on the target page while a challenge is open. */
export const challengeById = (id: ChallengeId) => CHALLENGES.find((c) => c.id === id)!;
