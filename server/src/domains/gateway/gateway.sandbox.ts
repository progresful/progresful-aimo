import { ulid } from 'ulid';
import type { Organization } from '../../../prisma/generated/prisma/index';
import prisma from '../../services/database.ts';
import { eventStore } from '../../services/eventStore.ts';
import { AppError } from '../../utils/AppError.ts';
import { updateOrganizationCommand } from '../auth/organization/organization.commands.ts';
import { appendAudit } from './audit.service.ts';
import { createAgentKey } from './gateway.agents.ts';
import type { Caller } from './gateway.auth.ts';
import { clearSandboxCommand, createAgentCommand, createPolicyCommand, updateAgentCommand } from './gateway.commands.ts';
import { signPolicy } from './gateway.policies.ts';
import { JUDGE, SANDBOX_AGENTS, SANDBOX_PLAIN_LANGUAGE, SANDBOX_POLICY_KEY, SANDBOX_POLICY_NAME, isSandboxMetadata, parseOrgMetadata, sandboxDocument, withResetAt } from './gateway.sandbox.logic.ts';

export * from './gateway.sandbox.logic.ts';

// Judge sandbox: an org of its own ("Judge sandbox · Test kitchen") where
// hackathon judges place their own orders under a policy that starts EMPTY (only
// the approval route: exceptions go to the judge) — the rules come from what
// they ask for — approve their own exceptions and reset everything back to that
// clean slate. The org is marked by `organization.metadata = { sandbox: true, resetAt }`.

// --- World building (seed + reset) ---------------------------------------------------

/** Creates and signs v1 of the empty sandbox policy (caller makes sure no version exists). */
export const createSandboxPolicy = async (organizationId: string, authorId: string, at = new Date()) => {
  const document = sandboxDocument();
  const createdAt = new Date(at.getTime() - 1000);
  const { event } = await createPolicyCommand(
    prisma,
    {
      id: ulid(createdAt.getTime()),
      organizationId,
      key: SANDBOX_POLICY_KEY,
      name: SANDBOX_POLICY_NAME,
      version: 1,
      status: 'draft',
      plainLanguage: SANDBOX_PLAIN_LANGUAGE,
      document: document as object,
      summary: `Starts empty — approvals go to ${JUDGE.name}`,
      createdAt,
      updatedAt: createdAt,
    },
    { authorId }
  );
  await eventStore.log(event!);
  return signPolicy(prisma, organizationId, SANDBOX_POLICY_KEY, { name: JUDGE.name, role: JUDGE.role, at }, authorId);
};

/** Agents exist and are bound to the sandbox policy; `rotateKeys` issues fresh keys (else only missing ones). */
export const ensureSandboxAgents = async (organizationId: string, owner: { id: string }, rotateKeys: boolean) => {
  const keys: { agentId: string; name: string; key: string; start: string | null }[] = [];
  for (const a of SANDBOX_AGENTS) {
    const existing = await prisma.agent.findUnique({ where: { id: a.id } });
    if (existing && existing.organizationId !== organizationId) throw new AppError(`Agent ${a.id} belongs to another organization`, 409);
    if (!existing) {
      const { event } = await createAgentCommand(prisma, { ...a, organizationId, policyId: SANDBOX_POLICY_KEY, apiKeyId: null }, { authorId: owner.id });
      await eventStore.log(event!);
    } else if (existing.policyId !== SANDBOX_POLICY_KEY) {
      const { event } = await updateAgentCommand(prisma, { id: a.id, policyId: SANDBOX_POLICY_KEY }, { authorId: owner.id });
      await eventStore.log(event!);
    }
    const agent = (await prisma.agent.findUnique({ where: { id: a.id } }))!;
    const hasKey = !!agent.apiKeyId && !!(await prisma.apikey.findUnique({ where: { id: agent.apiKeyId } }));
    if (rotateKeys || !hasKey) {
      const k = await createAgentKey(organizationId, a.id, owner);
      keys.push({ agentId: a.id, name: a.name, key: k.key, start: k.start ?? null });
    }
  }
  return keys;
};

// --- Endpoints ---------------------------------------------------------------------------

const orgOf = (caller: Caller) => prisma.organization.findUnique({ where: { id: caller.organizationId } });

/** The caller's org if it is a sandbox; 403 otherwise. */
export const requireSandbox = async (caller: Caller): Promise<Organization> => {
  const org = await orgOf(caller);
  if (!org || !isSandboxMetadata(org.metadata)) throw new AppError('Only available in a sandbox organization', 403);
  return org;
};

export const sandboxInfo = async (caller: Caller) => {
  const org = await orgOf(caller);
  if (!org || !isSandboxMetadata(org.metadata)) return { sandbox: false as const };
  const [policy, agents] = await Promise.all([
    prisma.policy.findFirst({ where: { organizationId: org.id, key: SANDBOX_POLICY_KEY, status: 'signed' }, orderBy: { version: 'desc' } }),
    prisma.agent.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
  ]);
  return {
    sandbox: true as const,
    org: { id: org.id, name: org.name },
    policy: { key: SANDBOX_POLICY_KEY, version: policy?.version ?? null },
    agents,
    resetAt: parseOrgMetadata(org.metadata).resetAt ?? null,
    mcpUrl: '/mcp',
    openapiUrl: '/api/openapi.json',
  };
};

export const issueSandboxKey = async (caller: Caller, agentId: string) => {
  const org = await requireSandbox(caller);
  const k = await createAgentKey(org.id, agentId, caller.user!);
  return { agentId: k.agentId, key: k.key, start: k.start ?? null };
};

let resetting: Promise<unknown> | null = null;

/** Wipes the sandbox back to the seeded state. Audit entries stay (one global chain); `resetAt` marks the cut. */
export const resetSandbox = async (caller: Caller) => {
  if (resetting) throw new AppError('A sandbox reset is already running', 409);
  const run = (async () => {
    const org = await requireSandbox(caller);
    const resetAt = new Date();
    const { response: cleared, event } = await clearSandboxCommand(prisma, { organizationId: org.id }, { authorId: caller.authorId });
    await eventStore.log(event!);
    const policy = await createSandboxPolicy(org.id, caller.authorId, resetAt);
    const keys = await ensureSandboxAgents(org.id, caller.user!, true);
    const { event: orgEvent } = await updateOrganizationCommand(prisma, { id: org.id, metadata: withResetAt(org.metadata, resetAt) }, { authorId: caller.authorId });
    await eventStore.log(orgEvent!);
    const name = caller.user?.name ?? 'someone';
    const entry = await appendAudit(
      {
        organizationId: org.id,
        orderId: null,
        step: 'audit',
        status: 'auto',
        actor: 'gateway',
        message: `Sandbox reset by ${name}`,
        payload: { resetAt: resetAt.toISOString(), resetBy: name, deleted: cleared, policy: { key: policy.key, version: policy.version }, agentKeysReissued: keys.map((k) => k.agentId) },
        at: resetAt,
      },
      caller.authorId
    );
    return { reset: true, resetAt: resetAt.toISOString(), deleted: cleared, policy: { key: policy.key, version: policy.version }, keys, auditSeq: entry.seq };
  })();
  resetting = run;
  try {
    return await run;
  } finally {
    resetting = null;
  }
};
