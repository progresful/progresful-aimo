import { ulid } from 'ulid';
import type { AuditEntry } from '../../../prisma/generated/prisma/index';
import prisma from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import { GENESIS_HASH, linkEntry, shortHash, verifyChain } from './audit.chain.ts';
import { appendAuditEntryCommand } from './gateway.commands.ts';

export type Step = 'request' | 'lookup' | 'stock' | 'substitutes' | 'lactose' | 'policy' | 'approval' | 'order' | 'audit';
export type StepStatus = 'auto' | 'pending' | 'blocked' | 'skipped';
export type Actor = 'buyer-agent' | 'gateway' | 'valio-api' | 'policy' | 'head-chef';

export type AuditInput = {
  organizationId: string;
  orderId: string | null;
  step: Step;
  status: StepStatus;
  actor: Actor;
  message: string;
  payload?: Record<string, unknown>;
  at?: Date;
};

// Appends are serialised twice: an in-process promise queue keeps this server
// from racing itself, and a Postgres advisory lock covers other processes (the
// seed script) — so the chain never forks.
const CHAIN_LOCK = 7_262_026;
let queue: Promise<unknown> = Promise.resolve();

const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

// Round-trip through JSON so what we hash is exactly what Postgres stores.
const plain = (payload: unknown) => JSON.parse(JSON.stringify(payload ?? {}));

export const appendAudit = (input: AuditInput, authorId: string) =>
  serialized(async () => {
    const { response, event } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK})`;
      const last = await tx.auditEntry.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true, hash: true } });
      const at = input.at ?? new Date();
      const linked = linkEntry(
        {
          seq: (last?.seq ?? 0) + 1,
          at: at.toISOString(),
          orderId: input.orderId,
          step: input.step,
          status: input.status,
          actor: input.actor,
          message: input.message,
          payload: plain(input.payload),
        },
        last?.hash ?? GENESIS_HASH
      );
      return appendAuditEntryCommand(
        tx,
        {
          id: ulid(at.getTime()),
          seq: linked.seq,
          organizationId: input.organizationId,
          orderId: linked.orderId,
          step: linked.step,
          status: linked.status,
          actor: linked.actor,
          message: linked.message,
          payload: linked.payload as object,
          prevHash: linked.prevHash,
          hash: linked.hash,
          createdAt: at,
        },
        { authorId }
      );
    });
    await eventStore.log(event!);
    return response;
  });

export const auditView = (e: AuditEntry) => ({
  seq: e.seq,
  id: e.id,
  at: e.createdAt.toISOString(),
  orderId: e.orderId,
  step: e.step,
  status: e.status,
  actor: e.actor,
  message: e.message,
  payload: e.payload,
  prevHash: e.prevHash,
  hash: e.hash,
});

const asChainEntry = (e: AuditEntry) => ({ ...auditView(e), orderId: e.orderId ?? null });

export const verifyAuditChain = async () => {
  const entries = await prisma.auditEntry.findMany({ orderBy: { seq: 'asc' } });
  const result = verifyChain(entries.map(asChainEntry));
  return { ...result, headShort: shortHash(result.head) };
};

export const chainHead = async () => (await prisma.auditEntry.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } }))?.hash ?? GENESIS_HASH;

export const listAudit = async (organizationId: string, q: { orderId?: string; limit?: number; before?: number }) => {
  const entries = await prisma.auditEntry.findMany({
    where: { organizationId, ...(q.orderId ? { orderId: q.orderId } : {}), ...(q.before ? { seq: { lt: q.before } } : {}) },
    orderBy: { seq: 'desc' },
    take: q.limit ?? 100,
  });
  return entries.map(auditView);
};
