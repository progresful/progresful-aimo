// One step for every rule change: write it, then sign it as the person who made it — the change
// is in effect at once. The signature, the new version and the audit entry stay; the ceremony goes.
// A small toast says what happened and offers Undo (which is just another signed change).
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Policy, PolicyRule, useDiscardPolicyDraft, useSignPolicy, useUpdatePolicy } from '@/api/gateway';
import { toaster } from '@/components/ui/toaster';
import { errorText } from '@/pages/home/format';

/** The version agents run on: the signed one (the latest row can be a draft for a moment). */
export const signedVersionOf = (p: Policy) => p.versions?.find((v) => v.status === 'signed') ?? (p.status === 'signed' ? p : null);

/** What an applied change left behind: the version it made and the rules it replaced. */
export type Applied = {
  policy: Policy;
  version: number;
  before: PolicyRule[] | null;
  beforeText: string | null;
  beforeVersion: number | null;
};

type Options = {
  /** No toast on success (the caller says it some other way). */
  quiet?: boolean;
  /** Offer Undo in the toast (default true). */
  undo?: boolean;
  /** Called with the outcome of an Undo from the toast (null when it didn't go through). */
  onUndone?: (applied: Applied | null) => void;
};

// Changes are applied one after another, never interleaved: a write and its signature belong together.
let queue: Promise<unknown> = Promise.resolve();
const inTurn = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** "Changed R01: up to €100 per order without approval" — a version's summary fits in 300 characters. */
export const changeSummary = (head: string, words: string) => `${head}: ${lower(words)}`.slice(0, 300);

export const useApplyRules = () => {
  const qc = useQueryClient();
  const { mutateAsync: update } = useUpdatePolicy();
  const { mutateAsync: sign } = useSignPolicy();
  const { mutateAsync: discard } = useDiscardPolicyDraft();
  const [busy, setBusy] = useState(0);

  /**
   * Writes the change (`write` — rules, text or a compile into the draft) and signs it with
   * `summary`. Resolves to what was applied, or null when it didn't go through — then the
   * previous rules stay in effect and a plain toast says so.
   */
  const applyWith = (key: string, write: () => Promise<unknown>, summary: string, opts: Options = {}): Promise<Applied | null> =>
    inTurn(async () => {
      setBusy((n) => n + 1);
      const was = qc.getQueryData<Policy>(['gw', 'policy', key]);
      const prior = was ? signedVersionOf(was) : null;
      // Didn't go through: throw away whatever was written, so the rules in effect are exactly the
      // old ones (never the only version of a policy that was never signed — that would delete it).
      const fail = async (title: string, err: unknown) => {
        if (prior)
          await discard(key).then(
            (p) => p && 'versions' in p && qc.setQueryData(['gw', 'policy', key], p),
            () => undefined
          );
        toaster.create({ type: 'error', title, description: errorText(err) });
        return null;
      };
      try {
        try {
          await write();
        } catch (err) {
          return await fail('Couldn’t change the rules — they stay as they were', err);
        }
        let fresh: Policy;
        try {
          fresh = await sign({ id: key, summary: summary.slice(0, 300) });
        } catch (err) {
          return await fail('Couldn’t sign the change — the rules stay as they were', err);
        }
        qc.setQueryData(['gw', 'policy', key], fresh);
        const applied: Applied = {
          policy: fresh,
          version: fresh.version,
          before: prior?.rules ?? null,
          beforeText: prior?.plainLanguage ?? null,
          beforeVersion: prior?.version ?? null,
        };
        if (!opts.quiet) {
          const canUndo = opts.undo !== false && !!applied.before;
          toaster.create({
            type: 'success',
            title: `Rules updated · v${fresh.version} signed by you`,
            description: summary.length > 140 ? `${summary.slice(0, 139)}…` : summary,
            duration: 8000,
            ...(canUndo
              ? { action: { label: 'Undo', onClick: () => void undo(key, applied).then((a) => opts.onUndone?.(a)) } }
              : {}),
          });
        }
        return applied;
      } finally {
        setBusy((n) => n - 1);
      }
    });

  /** Puts these rules in effect: one write, one signature. */
  const apply = (key: string, rules: PolicyRule[], summary: string, opts?: Options) =>
    applyWith(key, () => update({ id: key, rules }), summary, opts);

  /** Undo = the rules (and words) from before, applied — and signed — again. */
  const undo = (key: string, applied: Applied, opts: Options = {}) => {
    const { before, beforeText } = applied;
    if (!before) return Promise.resolve(null);
    const write = () => update({ id: key, rules: before, ...(beforeText !== null ? { plainLanguage: beforeText } : {}) });
    return applyWith(key, write, `Undo: back to v${applied.beforeVersion} rules`, { ...opts, undo: false });
  };

  /** Restore = an earlier version's rules and words, applied as a new signed version. */
  const restore = (key: string, v: { version: number; rules: PolicyRule[]; plainLanguage: string }, opts?: Options) =>
    applyWith(key, () => update({ id: key, rules: v.rules, plainLanguage: v.plainLanguage }), `Restored v${v.version} rules`, opts);

  return { apply, applyWith, undo, restore, applying: busy > 0 };
};

/**
 * A draft left over from before (the old save-then-sign flow) is thrown away quietly on load,
 * so what's on screen is simply the rules in effect. Only above a signed version, only once.
 */
export const useDropLeftoverDraft = (p: Policy | null | undefined) => {
  const qc = useQueryClient();
  const { mutate: discard } = useDiscardPolicyDraft();
  const checked = useRef<string | null>(null);
  useEffect(() => {
    if (!p || checked.current === p.key) return;
    checked.current = p.key;
    if (!p.hasDraft || !p.activeVersion || dropping.has(p.key)) return;
    // Once per policy at a time, however many screens (or dev remounts) ask.
    dropping.add(p.key);
    discard(p.key, {
      onSuccess: (fresh) => fresh && 'versions' in fresh && qc.setQueryData(['gw', 'policy', p.key], fresh),
      onSettled: () => dropping.delete(p.key),
    });
  }, [p, discard, qc]);
};
const dropping = new Set<string>();
