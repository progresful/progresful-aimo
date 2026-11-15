// "Try it yourself" progress, kept in localStorage so ticks survive reloads.
// Pages mark a challenge done when they see its real outcome (a blocked preview,
// a placed order, an added rule…); the Home panel reads the same store.
import { useSyncExternalStore } from 'react';

export type ChallengeId = 'within' | 'lactose' | 'budget' | 'rule' | 'catalog' | 'agent';

const KEY = 'mandate.tryit.v1';
const EVENT = 'mandate:tryit';

type Store = {
  done: Partial<Record<ChallengeId, string>>;
  /** budget: the order waiting for approval. */ budgetOrderId?: string;
};

const read = (): Store => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Store>;
    return { ...parsed, done: parsed.done ?? {} };
  } catch {
    return { done: {} };
  }
};

let cache: { raw: string | null; value: Store } = { raw: null, value: { done: {} } };
const snapshot = (): Store => {
  const raw = localStorage.getItem(KEY);
  if (raw !== cache.raw) cache = { raw, value: read() };
  return cache.value;
};

const write = (fn: (s: Store) => Store) => {
  const next = fn(read());
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};

export const useTryIt = () => useSyncExternalStore(subscribe, snapshot);

export const markDone = (id: ChallengeId) => {
  if (snapshot().done[id]) return;
  write((s) => ({ ...s, done: { ...s.done, [id]: new Date().toISOString() } }));
};

export const toggleDone = (id: ChallengeId) =>
  write((s) => {
    const done = { ...s.done };
    if (done[id]) delete done[id];
    else done[id] = new Date().toISOString();
    return { ...s, done };
  });

export const rememberBudgetOrder = (orderId: string) => write((s) => ({ ...s, budgetOrderId: orderId }));

export const resetProgress = () => write(() => ({ done: {} }));

/** Challenge ids the workspace understands in `?try=`. */
export const isChallenge = (v: string | null): v is ChallengeId =>
  !!v && ['within', 'lactose', 'budget', 'rule', 'catalog', 'agent'].includes(v);
