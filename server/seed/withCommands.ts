import { ulid } from 'ulid';
import db from '../src/services/database.ts';
import { eventStore } from '../src/services/eventStore.ts';
import logger from '../src/services/logger.ts';
import * as accountCommands from '../src/domains/auth/account/account.commands.ts';
import * as memberCommands from '../src/domains/auth/member/member.commands.ts';
import * as organizationCommands from '../src/domains/auth/organization/organization.commands.ts';
import * as userCommands from '../src/domains/auth/user/users.commands.ts';
import { seedGateway } from './gateway.ts';
import { seedSandbox } from './sandbox.ts';

export async function seedWithCommands() {
  const PASSWORD = process.env.SEED_USER_PASSWORD;
  if (!PASSWORD) {
    logger.error('Seed from commands failed due to missing environment variables!');
    throw new Error('Please set default user password for seeding this environment. Use `.env` file variable `SEED_USER_PASSWORD`');
  }

  try {
    // First check when eventStore is ready
    while (!eventStore.isReady) {
      await new Promise((res) => setTimeout(res, 500));
    }

    // Idempotent guard — if the seeded user exists, everything is seeded.
    const existingUser = await db.user.findUnique({ where: { id: '01KA0000000000000000000001' } });
    if (existingUser) {
      logger.info('Users + orgs already seeded. Skipping.');
      await seedGateway();
      await seedSandbox();
      return;
    }

    const { response: userDemo, event: createUserDemoEvent } = await userCommands.createUserCommand(
      db,
      {
        id: '01KA0000000000000000000001',
        email: 'demo@example.com',
        name: 'Anna Virtanen',
        role: 'user,admin',
        emailVerified: true,
      },
      {}
    );
    await eventStore.log(createUserDemoEvent);

    const { event: createAccountDemoEvent } = await accountCommands.createAccountCommand(
      db,
      {
        id: ulid(),
        providerId: 'credential',
        accountId: userDemo.id,
        userId: userDemo.id,
        password: PASSWORD,
      },
      { authorId: userDemo.id }
    );
    await eventStore.log(createAccountDemoEvent);

    const { response: orgDemo, event: createOrgDemoEvent } = await organizationCommands.createOrganizationCommand(
      db,
      { id: '01KA0000000000000000000002', name: 'HUS · Ward 4 kitchen', slug: 'hus-ward-4' },
      { authorId: userDemo.id }
    );
    await eventStore.log(createOrgDemoEvent);

    const { event: createMemberDemoEvent } = await memberCommands.createMemberCommand(
      db,
      {
        id: ulid(),
        organizationId: orgDemo.id,
        userId: userDemo.id,
        role: 'owner',
      },
      { authorId: userDemo.id }
    );
    await eventStore.log(createMemberDemoEvent);

    await seedGateway();
    await seedSandbox();

    logger.info('Seed from commands succesfully completed!');
  } catch (err) {
    logger.info('Seed from commands failed unexpectedly:');
    logger.error(err);
  }
}

(async () => await seedWithCommands())();
