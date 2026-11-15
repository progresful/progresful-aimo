import { useEffect, useMemo, useRef, useState } from 'react';
import { OrderPreview, OrderRequestBody, Policy, PolicyRule, RequestRule, usePolicy, usePreviewPolicyOrder } from '@/api/gateway';
import { errorText } from '@/pages/home/format';
import { Applied, useApplyRules, useDropLeftoverDraft } from '@/pages/policies/apply';
import { problemsOf, stableJson } from '@/pages/playbook/editor/model';
import { ruleShort, signedOf } from './model';

/**
 * The policy behind an order. A rule change takes effect at once: it's written and signed by
 * the person who made it (`useApplyRules`), one version per change. `local` holds an edit being
 * typed in a form, before it's applied. `previous` is what the latest change replaced, for its
 * "changed" marks on the graph.
 */
export const usePolicyDraft = (policyKey: string | null) => {
  const policyQ = usePolicy(policyKey);
  const p = policyQ.data ?? null;
  const signed = p ? signedOf(p) : null;
  const [local, setLocal] = useState<PolicyRule[] | null>(null);
  const [last, setLast] = useState<Applied | null>(null);
  const { apply: applyRules, undo: undoRules, applying } = useApplyRules();
  useDropLeftoverDraft(p);

  const inEffect = useMemo(() => signed?.rules ?? [], [signed]);
  const rules = local ?? inEffect;
  const dirty = local !== null && stableJson(local) !== stableJson(inEffect);
  const problems = useMemo(() => problemsOf(rules), [rules]);

  /** Puts the rules in effect (written + signed as you). Resolves to the result, or null (already shown). */
  const apply = (next: PolicyRule[], summary: string, opts?: { quiet?: boolean }): Promise<Applied | null> => {
    if (!p) return Promise.resolve(null);
    return applyRules(p.key, next, summary, { ...opts, onUndone: (a) => setLast(a) }).then((done) => {
      // Keep edits made while this change was on its way.
      setLocal((cur) => (cur && stableJson(cur) !== stableJson(next) ? cur : null));
      if (done) setLast(done);
      return done;
    });
  };

  return {
    policy: p,
    loading: policyQ.isLoading,
    error: policyQ.error,
    signed,
    /** What's being looked at: the edit being typed, else the rules in effect. */
    rules,
    /** What the latest change replaced (for its "changed" marks), while it's the version in effect. */
    previous: last && signed && last.version === signed.version ? last.before : null,
    local,
    setLocal,
    dirty,
    problems,
    apply,
    /** Undo of an applied change: the rules from before, signed again. */
    undo: (done: Applied) => (p ? undoRules(p.key, done, { quiet: true }).then((a) => (a && setLast(a), a)) : Promise.resolve(null)),
    applying,
  };
};

export type PolicyDraft = ReturnType<typeof usePolicyDraft>;

type PlanResult = { key: string; signed: OrderPreview };

/**
 * Dry-runs the order (POST /orders/preview — nothing is written) against the rules in effect.
 * Debounced; a stale answer never overwrites a newer one. The last answer stays on screen
 * while the next loads.
 */
export const usePlan = (body: OrderRequestBody | null, policy: Policy | null) => {
  const { mutateAsync: preview } = usePreviewPolicyOrder();
  // Re-run when a new version is signed.
  const stamp = policy ? `${policy.activeVersion}` : '';
  // Bumped by retry(): the same request and rules, asked again.
  const [attempt, setAttempt] = useState(0);
  const key = body ? JSON.stringify([body, stamp, attempt]) : null;
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!key) {
      seq.current++;
      return;
    }
    // The request is read back from the key: a new body object with the same content asks nothing new.
    const [asked] = JSON.parse(key) as [OrderRequestBody];
    const t = setTimeout(() => {
      const mine = ++seq.current;
      preview(asked)
        .then((signed) => mine === seq.current && setResult({ key, signed }))
        .catch((err) => mine === seq.current && setError({ key, message: errorText(err) }));
    }, 500);
    return () => clearTimeout(t);
  }, [key, preview]);

  const current = result && result.key === key ? result : null;
  const shown = body ? result : null;
  return {
    signed: shown?.signed ?? null,
    /** The answer on screen is for exactly this request and these rules. */
    fresh: !!current,
    checking: !!body && !current && error?.key !== key,
    error: body && error?.key === key ? error.message : null,
    retry: () => setAttempt((n) => n + 1),
  };
};

// --- Rules from the request (judge sandbox) ---------------------------------------------

/** Rules that stay whatever a request says: who approves, how substitutes are ranked. */
const isRouting = (r: PolicyRule) => r.type === 'approval' || r.type === 'substitution.rank';
const sameRule = (a: PolicyRule, b: PolicyRule) => {
  const strip = (r: PolicyRule) => stableJson({ ...r, key: '', label: '' });
  return strip(a) === strip(b);
};
const freeKey = (key: string, taken: Set<string>) => {
  if (!taken.has(key)) return key;
  for (let i = 2; ; i++) if (!taken.has(`${key}.${i}`)) return `${key}.${i}`;
};

/** What the latest request put in effect: its rules, how many earlier ones it cleared, the version it signed. */
export type FromRequest = { rules: RequestRule[]; cleared: number; applied: Applied | null; version: number };

/**
 * In the judge sandbox the rules come from what the person asks: each parsed request (`asked`,
 * a new object per parse) SETS the rules to exactly the ones its words state ("local only" →
 * Finnish origin), applied and signed by you in one step, with Undo. Leftovers from earlier
 * requests are cleared; rules added or edited by hand on this order's graph stay; who approves
 * stays. Off (`enabled` false — every org but the sandbox) nothing is ever changed.
 */
export const useRequestRules = (draft: PolicyDraft, enabled: boolean, asked: { rules?: RequestRule[]; text: string } | null) => {
  const p = draft.policy;
  const inEffect = draft.signed;
  const [made, setMade] = useState<FromRequest | null>(null);
  // The request whose rules are settled (in effect, or it didn't go through).
  const [settled, setSettled] = useState<object | null>(null);
  const [undoing, setUndoing] = useState(false);
  const handled = useRef<object | null>(null);
  // Rules in effect when the page opened (leftovers: a request clears them) and every rule a request put in effect here.
  const base = useRef<Set<string> | null>(null);
  const own = useRef(new Set<string>());
  const applyRef = useRef(draft.apply);
  useEffect(() => {
    applyRef.current = draft.apply;
  });

  useEffect(() => {
    if (inEffect && !base.current) base.current = new Set(inEffect.rules.map((r) => stableJson(r)));
  }, [inEffect]);

  useEffect(() => {
    if (!asked || handled.current === asked || !enabled || !p || !inEffect || draft.applying) return;
    handled.current = asked;
    const current = inEffect.rules;
    const known = (r: PolicyRule) => !!base.current?.has(stableJson(r)) || own.current.has(stableJson(r));
    // Added or edited by hand on this order: not from a request, not there when the page opened.
    const kept = current.filter((r) => !isRouting(r) && !known(r));
    const routing = current.filter(isRouting);
    const taken = new Set([...kept, ...routing].map((r) => r.key));
    const fromWords: RequestRule[] = [];
    for (const x of asked.rules ?? []) {
      if (kept.some((k) => sameRule(k, x.rule))) continue;
      const key = freeKey(x.rule.key, taken);
      taken.add(key);
      fromWords.push({ ...x, rule: { ...x.rule, key } });
    }
    const next = [...fromWords.map((x) => x.rule), ...kept, ...routing];
    const cleared = current.filter((r) => !isRouting(r) && !next.some((n) => stableJson(n) === stableJson(r))).length;
    for (const r of fromWords) own.current.add(stableJson(r.rule));
    const done = (m: FromRequest | null) => {
      if (m) setMade(m);
      setSettled(asked);
    };
    if (stableJson(next) === stableJson(current)) {
      // Already exactly these rules: nothing to sign.
      void Promise.resolve().then(() => done({ rules: fromWords, cleared: 0, applied: null, version: inEffect.version }));
      return;
    }
    const said = fromWords.map((x) => ruleShort(x.rule)).join(' · ') || 'no rules';
    const summary = `Rules from your request “${asked.text.trim().slice(0, 120)}”: ${said}`;
    void applyRef.current(next, summary, { quiet: true }).then((applied) => done(applied ? { rules: fromWords, cleared, applied, version: applied.version } : null));
  }, [asked, enabled, p, inEffect, draft.applying]);

  // Shown while the rules it put in effect are the ones in effect.
  const active = made && inEffect && made.version === inEffect.version ? made : null;
  return {
    active,
    /** The rules are being set from the request (the order waits for them). */
    busy: enabled && !!asked && settled !== asked,
    undoing,
    undo: () => {
      if (!active?.applied) return;
      setUndoing(true);
      void draft.undo(active.applied).then((a) => {
        setUndoing(false);
        if (a) setMade(null);
      });
    },
  };
};
