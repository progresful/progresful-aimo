import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditEntry, Check } from '@/api/gateway';
import { StepStatus, eur, fmtDay, num } from './graph';

export type RunPhase = 'idle' | 'running' | 'waiting' | 'done';

export type RunState = {
  phase: RunPhase;
  /** The order whose audit entries are on the graph. */
  orderId: string | null;
  statuses: Record<string, StepStatus>;
  outcomes: Record<string, string>;
  // Edges the run has travelled, and the ones it travelled most recently.
  takenEdges: string[];
  liveEdges: string[];
  activeStepId: string | null;
  /** Real audit entries, in chain order, as they landed on the graph. */
  log: AuditEntry[];
  replaying: boolean;
};

const initial: RunState = {
  phase: 'idle',
  orderId: null,
  statuses: {},
  outcomes: {},
  takenEdges: [],
  liveEdges: [],
  activeStepId: null,
  log: [],
  replaying: false,
};

type RunEvent = { entry: AuditEntry; status: StepStatus; outcome?: string; edges: string[]; after: number };

type P = Record<string, unknown>;
const arr = <T = P>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

/** Preview entries (POST /orders/preview) are predictions: nothing has happened yet. */
const isPreview = (e: AuditEntry) => e.id.startsWith('preview');

/** Short chip text under a node, read from the entry's payload. */
const outcomeOf = (e: AuditEntry): string | undefined => {
  const p = e.payload ?? {};
  const preview = isPreview(e);
  switch (e.step) {
    case 'request': {
      const req = (p.request ?? {}) as { lines?: { quantity: number; unit: string }[]; requestedDate?: string };
      const qty = arr<{ quantity: number; unit: string }>(req.lines).map((l) => `${num(l.quantity)} ${l.unit}`).join(' + ');
      return [qty, req.requestedDate ? fmtDay(req.requestedDate).split(' ')[0] : null].filter(Boolean).join(' · ') || 'Received';
    }
    case 'lookup':
      return p.previousQuoteId ? 'Quote re-issued' : 'Quote signed';
    case 'stock': {
      const short = arr<{ short: number; unit: string }>(p.lines).filter((l) => l.short > 0);
      return short.length ? `Short ${short.map((l) => `${num(l.short)} ${l.unit}`).join(' + ')}` : 'Covered';
    }
    case 'substitutes': {
      const picked = arr<{ code: string; verdict: string }>(p.candidates).filter((c) => c.verdict === 'picked');
      return picked.length ? `${picked[0].code} best` : 'None fit';
    }
    case 'lactose': {
      if (e.status === 'blocked') return 'Blocked';
      const blocked = arr<{ verdict?: string }>(p.checked).filter((c) => c.verdict === 'blocked').length;
      return blocked ? `${blocked} blocked` : 'All pass';
    }
    case 'policy': {
      if (e.status === 'auto') return 'Within limits';
      if (e.status === 'blocked') return 'Blocked';
      const failing = arr<Check>(p.checks).filter((c) => !c.passed && c.severity === 'approval').map((c) => c.rule);
      if (failing.includes('limit.perOrder')) return 'Over limit';
      if (failing.includes('limit.perWeek')) return 'Over weekly';
      if (failing.some((r) => r.startsWith('substitution'))) return 'Substitute';
      if (failing.includes('data.missing')) return 'Missing data';
      return 'Needs sign-off';
    }
    case 'approval': {
      if (e.status === 'pending') {
        const name = (p.approver as { name?: string } | undefined)?.name;
        return preview ? (name ? `Needs ${name.split(' ')[0]}` : 'Needs a person') : 'Waiting';
      }
      const outcome = p.outcome as string | undefined;
      return ({ approved: 'Approved', partial: 'In-stock only', declined: 'Declined', timed_out: 'Timed out' } as Record<string, string>)[outcome ?? ''] ?? 'Decided';
    }
    case 'order': {
      if (e.status === 'blocked') return 'Not placed';
      if (e.status !== 'auto') return undefined;
      if (preview) return typeof p.total === 'number' ? `Would place ${eur(p.total, 0)}` : 'Would place';
      const total = typeof p.total === 'number' ? eur(p.total, 0) : 'Placed';
      return p.status === 'partial' ? `${total} · partial` : total;
    }
    case 'audit':
      return typeof p.entries === 'number' ? `${p.entries} entries` : 'Appended';
  }
};

/** Which edges an entry travels. Looks ahead in its batch to tell which way `stock` branched. */
const edgesOf = (e: AuditEntry, batch: AuditEntry[], i: number): string[] => {
  if (e.status === 'skipped') return [];
  const next = (step: string) => batch.slice(i + 1).find((x) => x.step === step);
  switch (e.step) {
    case 'request':
      return ['e-request-lookup'];
    case 'lookup':
      return e.payload?.previousQuoteId ? [] : ['e-lookup-stock'];
    case 'stock': {
      const subs = next('substitutes');
      const short = arr<{ short: number }>(e.payload?.lines).some((l) => l.short > 0);
      return (subs ? subs.status !== 'skipped' : short) ? ['e-stock-substitutes'] : ['e-stock-policy'];
    }
    case 'substitutes':
      return ['e-substitutes-lactose'];
    case 'lactose':
      return e.status === 'blocked' ? [] : ['e-lactose-policy'];
    case 'policy':
      return e.status === 'auto' ? ['e-policy-order'] : e.status === 'pending' ? ['e-policy-approval'] : [];
    case 'approval': {
      if (e.status === 'pending') return [];
      const order = next('order');
      return order && order.status === 'auto' ? ['e-approval-order'] : [];
    }
    case 'order':
      return ['e-order-audit'];
    default:
      return [];
  }
};

const toEvents = (entries: AuditEntry[]): RunEvent[] =>
  entries.map((entry, i) => ({
    entry,
    status: entry.status,
    outcome: outcomeOf(entry),
    edges: edgesOf(entry, entries, i),
    after: i === 0 ? 300 : entry.status === 'skipped' ? 160 : 780,
  }));

function apply(state: RunState, event: RunEvent, record: boolean): RunState {
  const id = event.entry.step;
  return {
    ...state,
    statuses: { ...state.statuses, [id]: event.status },
    outcomes: event.outcome ? { ...state.outcomes, [id]: event.outcome } : state.outcomes,
    takenEdges: event.edges.length ? [...new Set([...state.takenEdges, ...event.edges])] : state.takenEdges,
    liveEdges: event.edges,
    log: record ? [...state.log, event.entry] : state.log,
  };
}

/** The graph's final state for a set of entries, without animation (e.g. a compact read-only graph). */
export const runStateFrom = (entries: AuditEntry[], opts: { orderId: string | null; waiting?: boolean }): RunState => {
  const final = toEvents(entries).reduce((s, e) => apply(s, e, true), { ...initial, orderId: opts.orderId });
  return { ...final, phase: opts.waiting ? 'waiting' : 'done', activeStepId: opts.waiting ? 'approval' : null, liveEdges: [] };
};

/**
 * Plays real audit entries onto the graph, step by step. `play` starts a fresh
 * run, `append` continues it (after an approval decision), `replay` re-plays
 * what's on the log. `waiting` marks a run that ends on an open approval.
 */
export function useRun() {
  const [state, setState] = useState<RunState>(initial);
  const queue = useRef<RunEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recording = useRef(true);
  const speed = useRef(1);
  const waiting = useRef(false);
  // Highest audit seq already on (or queued for) the graph, so live updates never double up.
  const lastSeq = useRef(0);
  const busy = useRef(false);

  // Held in a ref so the timer callback can schedule the next event.
  const stepRef = useRef<() => void>(() => {});
  const step = useCallback(() => stepRef.current(), []);

  useEffect(() => {
    stepRef.current = () => {
      const event = queue.current.shift();
      busy.current = !!event;
      if (!event) {
        setState((s) => ({ ...s, phase: waiting.current ? 'waiting' : 'done', activeStepId: waiting.current ? 'approval' : null, liveEdges: [], replaying: false }));
        return;
      }
      const id = event.entry.step;
      setState((s) => ({
        ...s,
        phase: 'running',
        activeStepId: event.status === 'skipped' ? s.activeStepId : id,
        statuses: event.status === 'skipped' ? s.statuses : { ...s.statuses, [id]: 'running' },
      }));
      timer.current = setTimeout(() => {
        setState((s) => apply(s, event, recording.current));
        step();
      }, event.after * speed.current);
    };
  }, [step]);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = [];
    busy.current = false;
    waiting.current = false;
    lastSeq.current = 0;
    setState(initial);
  }, []);

  const play = useCallback(
    (entries: AuditEntry[], opts: { orderId: string | null; waiting?: boolean; /** < 1 plays faster (previews). */ speed?: number }) => {
      clearTimeout(timer.current);
      recording.current = true;
      speed.current = opts.speed ?? 1;
      waiting.current = !!opts.waiting;
      lastSeq.current = Math.max(0, ...entries.map((e) => e.seq));
      queue.current = toEvents(entries);
      busy.current = true;
      setState({ ...initial, orderId: opts.orderId, phase: 'running' });
      timer.current = setTimeout(step, 0);
    },
    [step]
  );

  const append = useCallback(
    (entries: AuditEntry[], opts: { waiting?: boolean } = {}) => {
      const fresh = entries.filter((e) => e.seq > lastSeq.current);
      if (!fresh.length) return;
      lastSeq.current = Math.max(...fresh.map((e) => e.seq));
      waiting.current = !!opts.waiting;
      queue.current = [...queue.current, ...toEvents(fresh)];
      if (busy.current) return; // already playing — the new entries follow on
      recording.current = true;
      speed.current = 1;
      busy.current = true;
      setState((s) => ({ ...s, phase: 'running' }));
      timer.current = setTimeout(step, 0);
    },
    [step]
  );

  // Puts a finished (or waiting) run on the graph at once — opening an old run.
  const show = useCallback((entries: AuditEntry[], opts: { orderId: string | null; waiting?: boolean }) => {
    clearTimeout(timer.current);
    queue.current = [];
    busy.current = false;
    waiting.current = !!opts.waiting;
    lastSeq.current = Math.max(0, ...entries.map((e) => e.seq));
    setState(runStateFrom(entries, opts));
  }, []);

  // Replays the recorded log onto a blank graph — the audit trail as a movie.
  const replay = useCallback((opts: { waiting?: boolean } = {}) => {
    clearTimeout(timer.current);
    waiting.current = !!opts.waiting;
    busy.current = true;
    setState((s) => {
      queue.current = toEvents(s.log);
      return { ...initial, orderId: s.orderId, log: s.log, replaying: true, phase: 'running' };
    });
    recording.current = false;
    speed.current = 0.45;
    timer.current = setTimeout(step, 0);
  }, [step]);

  useEffect(() => {
    // StrictMode (dev) unmounts and remounts once right after a run is queued on mount — pick it back up.
    if (busy.current) timer.current = setTimeout(step, 0);
    return () => clearTimeout(timer.current);
  }, [step]);

  return { state, play, append, replay, reset, show };
}
