import logger from '../src/services/logger.ts';
import { eventStore } from '../src/services/eventStore.ts';

// Below used to register commands to the eventStore
import '../src/domains/auth/account/account.commands.ts';
import '../src/domains/auth/apikey/apikey.commands.ts';
import '../src/domains/auth/feature/feature.commands.ts';
import '../src/domains/auth/featureFlag/featureFlag.commands.ts';
import '../src/domains/auth/invitation/invitation.commands.ts';
import '../src/domains/auth/member/member.commands.ts';
import '../src/domains/auth/organization/organization.commands.ts';
import '../src/domains/auth/team/team.commands.ts';
import '../src/domains/auth/teamMember/teamMember.commands.ts';
import '../src/domains/auth/user/users.commands.ts';
import '../src/domains/auth/verification/verification.commands.ts';
import '../src/domains/gateway/gateway.commands.ts';

export async function seedFromEventsDB() {
  const PASSWORD = process.env.SEED_USER_PASSWORD;
  if (!PASSWORD) {
    logger.error('Seed from commands failed due to missing environment variables!');
    throw new Error('Please set default user password for seeding this environment. Use `.env` file variable `SEED_USER_PASSWORD`');
  }

  logger.warn('Seed from events.db will reset the `events.db` content! Respond with "yes" to proceed.');
  // TODO: as for confirmation

  // const response = prompt('Continue to reset the events.db content and seed the database?');
  // if (response !== 'yes') {
  //   logger.error('Seed from commands failed due to user input!');
  //   return;
  // }

  try {
    // First check when eventStore is ready
    while (!eventStore.isReady) {
      await new Promise((res) => setTimeout(res, 500));
    }
    // get all events
    const events = await eventStore.getAllEvents();
    await eventStore.replayEvents(events);
  } catch (err) {
    logger.info('Seed from events.db failed unexpectedly:');
    logger.error(err);
    return;
  }
  logger.info('Seed from events.db succesfully completed!');
}

(async () => await seedFromEventsDB())();
