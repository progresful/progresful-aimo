import { PrismaClient as EventStorePrismaClient } from '../../prisma/generated/eventstore_prisma/client.js';

const eventStoreDatabase = new EventStorePrismaClient();

export default eventStoreDatabase;
