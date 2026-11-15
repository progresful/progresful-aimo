import type { Agent } from '../../../prisma/generated/prisma/index';
import prisma from '../../services/database.ts';
import { auth } from '../../services/auth/auth.ts';
import { eventStore } from '../../services/eventStore.ts';
import { AppError } from '../../utils/AppError.ts';
import { deleteApikeyCommand } from '../auth/apikey/apikey.commands.ts';
import { updateAgentCommand } from './gateway.commands.ts';
import { localDay } from './gateway.time.ts';

// Agents are the outside AI buyers. Each has at most one live API key (a Better
// Auth API key owned by the person who issued it); the key → agent → policy
// binding is what stops an agent from choosing its own rules.

export const KEY_PREFIX = 'mk_live_';

const keyInfo = async (apiKeyId: string | null) => {
  if (!apiKeyId) return null;
  const k = await prisma.apikey.findUnique({ where: { id: apiKeyId } });
  return k ? { id: k.id, start: k.start, prefix: k.prefix, enabled: k.enabled, createdAt: k.createdAt.toISOString(), lastRequest: k.lastRequest?.toISOString() ?? null, requestCount: k.requestCount } : null;
};

export const agentView = async (a: Agent) => {
  const [policy, orders, entriesToday] = await Promise.all([
    prisma.policy.findFirst({ where: { organizationId: a.organizationId, key: a.policyId, status: 'signed' }, orderBy: { version: 'desc' } }),
    prisma.order.groupBy({ by: ['status'], where: { agentId: a.id }, _count: true }),
    prisma.auditEntry.findMany({ where: { organizationId: a.organizationId, createdAt: { gte: new Date(Date.now() - 36 * 3600 * 1000) } }, select: { createdAt: true, orderId: true } }),
  ]);
  const count = (...statuses: string[]) => orders.filter((o) => statuses.includes(o.status)).reduce((s, o) => s + o._count, 0);
  const agentOrders = new Set((await prisma.order.findMany({ where: { agentId: a.id }, select: { id: true } })).map((o) => o.id));
  return {
    id: a.id,
    name: a.name,
    vendor: a.vendor,
    model: a.model,
    host: a.host,
    transport: a.transport,
    policy: { key: a.policyId, version: policy?.version ?? null, name: policy?.name ?? null },
    key: await keyInfo(a.apiKeyId),
    stats: {
      ordersPlaced: count('executed', 'partial'),
      approvalsRequested: await prisma.approval.count({ where: { order: { agentId: a.id } } }),
      blocked: count('blocked'),
      auditEntriesToday: entriesToday.filter((e) => e.orderId && agentOrders.has(e.orderId) && localDay(e.createdAt) === localDay()).length,
    },
    createdAt: a.createdAt.toISOString(),
  };
};

export const listAgents = async (organizationId: string) => Promise.all((await prisma.agent.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } })).map(agentView));

const findAgent = async (organizationId: string, id: string) => {
  const agent = await prisma.agent.findFirst({ where: { id, organizationId } });
  if (!agent) throw new AppError('Agent not found', 404, { id });
  return agent;
};

export const revokeKey = async (apiKeyId: string, authorId: string) => {
  if (!(await prisma.apikey.findUnique({ where: { id: apiKeyId } }))) return;
  const { event } = await deleteApikeyCommand(prisma, { id: apiKeyId }, { authorId });
  await eventStore.log(event!);
};

/** Issues a fresh key (revoking the previous one). The plaintext is returned once and never stored. */
export const createAgentKey = async (organizationId: string, agentId: string, owner: { id: string }) => {
  const agent = await findAgent(organizationId, agentId);
  if (agent.apiKeyId) await revokeKey(agent.apiKeyId, owner.id);
  const created = await auth.api.createApiKey({
    body: { userId: owner.id, name: agent.name, prefix: KEY_PREFIX },
  });
  const { event } = await updateAgentCommand(prisma, { id: agent.id, apiKeyId: created.id }, { authorId: owner.id });
  await eventStore.log(event!);
  return { agentId: agent.id, keyId: created.id, key: created.key, start: created.start, prefix: created.prefix, createdAt: new Date(created.createdAt).toISOString(), note: 'Shown once — store it now' };
};

export const deleteAgentKey = async (organizationId: string, agentId: string, keyId: string, authorId: string) => {
  const agent = await findAgent(organizationId, agentId);
  if (agent.apiKeyId !== keyId) throw new AppError('Key not found for this agent', 404, { keyId });
  await revokeKey(keyId, authorId);
  const { event } = await updateAgentCommand(prisma, { id: agent.id, apiKeyId: null }, { authorId });
  await eventStore.log(event!);
};
