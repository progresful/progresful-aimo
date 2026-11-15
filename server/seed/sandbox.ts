import { ulid } from 'ulid';
import db from '../src/services/database.ts';
import { eventStore } from '../src/services/eventStore.ts';
import logger from '../src/services/logger.ts';
import * as accountCommands from '../src/domains/auth/account/account.commands.ts';
import * as memberCommands from '../src/domains/auth/member/member.commands.ts';
import * as organizationCommands from '../src/domains/auth/organization/organization.commands.ts';
import * as userCommands from '../src/domains/auth/user/users.commands.ts';
import { JUDGE, JUDGE_USER_ID, SANDBOX_ORG, SANDBOX_POLICY_KEY, createSandboxPolicy, ensureSandboxAgents, isSandboxMetadata, parseOrgMetadata } from '../src/domains/gateway/gateway.sandbox.ts';

// Judge sandbox (idempotent): judge@mandate.dev owns "Judge sandbox · Test
// kitchen" with a policy that starts empty (only the approval route: exceptions
// go to the judge — the rules come from each request) and two agents with fresh
// keys. No orders. An existing sandbox policy is left alone: Reset empties it.

const seedJudge = async () => {
  if (await db.user.findUnique({ where: { id: JUDGE_USER_ID } })) return;
  const { event: u } = await userCommands.createUserCommand(db, { id: JUDGE_USER_ID, email: JUDGE.email, name: JUDGE.name, role: 'user', emailVerified: true }, {});
  await eventStore.log(u);
  const { event: a } = await accountCommands.createAccountCommand(
    db,
    { id: ulid(), providerId: 'credential', accountId: JUDGE_USER_ID, userId: JUDGE_USER_ID, password: process.env.SEED_USER_PASSWORD },
    { authorId: JUDGE_USER_ID }
  );
  await eventStore.log(a);
  logger.info(`Sandbox seed: user ${JUDGE.email}`);
};

const seedOrg = async () => {
  const org = await db.organization.findUnique({ where: { id: SANDBOX_ORG.id } });
  if (!org) {
    const { event } = await organizationCommands.createOrganizationCommand(db, { ...SANDBOX_ORG, metadata: JSON.stringify({ sandbox: true, resetAt: null }) }, { authorId: JUDGE_USER_ID });
    await eventStore.log(event);
    logger.info(`Sandbox seed: org ${SANDBOX_ORG.name}`);
  } else if (!isSandboxMetadata(org.metadata)) {
    const { event } = await organizationCommands.updateOrganizationCommand(db, { id: org.id, metadata: JSON.stringify({ ...parseOrgMetadata(org.metadata), sandbox: true }) }, { authorId: JUDGE_USER_ID });
    await eventStore.log(event);
  }
  if (!(await db.member.findFirst({ where: { organizationId: SANDBOX_ORG.id, userId: JUDGE_USER_ID } }))) {
    const { event } = await memberCommands.createMemberCommand(db, { id: ulid(), organizationId: SANDBOX_ORG.id, userId: JUDGE_USER_ID, role: 'owner' }, { authorId: JUDGE_USER_ID });
    await eventStore.log(event);
  }
};

export async function seedSandbox() {
  while (!eventStore.isReady) await new Promise((res) => setTimeout(res, 200));
  await seedJudge();
  await seedOrg();
  if (!(await db.policy.findFirst({ where: { organizationId: SANDBOX_ORG.id, key: SANDBOX_POLICY_KEY } }))) {
    const p = await createSandboxPolicy(SANDBOX_ORG.id, JUDGE_USER_ID);
    logger.info(`Sandbox seed: policy ${p.key} v${p.version} signed by ${p.signedBy}`);
  }
  const keys = await ensureSandboxAgents(SANDBOX_ORG.id, { id: JUDGE_USER_ID }, false);
  for (const k of keys) logger.info(`Sandbox seed: key for ${k.agentId} ${k.start}… (issue a new one with POST /api/gw/sandbox/key)`);
  logger.info('Sandbox seed completed.');
}
